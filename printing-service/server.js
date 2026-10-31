/**
 * GMK Food Court - Standalone Thermal Printing Service
 * Zero-dependency Node.js HTTP printing server for Windows billing stations.
 * Listens on port 12111 with full CORS support.
 *
 * PADDING SPECIFICATION (Exact +20% increase on all 4 sides):
 * - Top: +20% (29 dots / 3.6mm)
 * - Bottom: +20% (86 dots / 10.8mm)
 * - Left: +20% (4.8mm / GS L 8)
 * - Right: +20% (4.8mm / 46 columns)
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn, execFile } = require("child_process");
const net = require("net");

const PORT = process.env.PORT || 12111;
const CONFIG_PATH = path.resolve(__dirname, "printer-config.json");
const BIN_PATH = path.resolve(__dirname, "..", "src", "printing", "bin", "winrawprint.exe");

// Deduplication
const jobHistory = new Map();

// Sequential FIFO Queue
const printQueue = [];
let isQueueProcessing = false;
let currentPrinterState = "READY"; // CONNECTING | CONNECTED | READY | PRINTING | DISCONNECTED | ERROR

function loadConfig() {
  const defaults = {
    connectionType: "windows-spooler",
    printerName: "Xprinter XP-80",
    networkHost: "192.168.1.100",
    networkPort: 9100,
    columns: 46, // 46 columns after +20% horizontal padding
    autoCut: true,
    cutType: "partial",
    currencySymbol: "Rs.",
    feedLinesBeforeCut: 3,
  };
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return { ...defaults, ...JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) };
    }
  } catch {}
  return defaults;
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
}

// ESC/POS Command Generation (+20% padding on all 4 sides, 46 columns)
function buildEscpos(payload, config) {
  const bytes = [];
  const cols = 46; // Exact 46 columns to accommodate +20% left & right padding
  const sym = config.currencySymbol || "Rs.";

  // ESC @: Init
  bytes.push(0x1b, 0x40);
  // ESC t 16: WPC1252
  bytes.push(0x1b, 0x74, 16);
  // ESC 2: default line spacing
  bytes.push(0x1b, 0x32);

  // Left Padding (+20%: adds 8 dots = 1.0mm hardware margin)
  bytes.push(0x1d, 0x4c, 8, 0);
  // Set Printable Area Width: 563 dots (70.4mm)
  bytes.push(0x1d, 0x57, 563 % 256, Math.floor(563 / 256));

  // Top Padding (+20%: feeds 29 dots = 3.6mm before header)
  bytes.push(0x1b, 0x4a, 29);

  const sanitize = (s) =>
    (s || "")
      .replace(/₹/g, "Rs.")
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, "-")
      .replace(/\u00A0/g, " ");

  const addText = (s) => {
    const clean = sanitize(s);
    for (let i = 0; i < clean.length; i++) {
      const code = clean.charCodeAt(i);
      bytes.push(code <= 0xff ? code : 0x3f);
    }
  };

  const addLine = (s = "") => {
    if (s) addText(s);
    bytes.push(0x0a);
  };

  const setAlign = (a) => {
    bytes.push(0x1b, 0x61, a === "center" ? 1 : a === "right" ? 2 : 0);
  };

  const setBold = (b) => {
    bytes.push(0x1b, 0x45, b ? 1 : 0);
  };

  const setSize = (w, h) => {
    bytes.push(0x1d, 0x21, (w === 2 ? 0x10 : 0) | (h === 2 ? 0x01 : 0));
  };

  const divider = (ch = "-") => {
    addLine(ch.repeat(cols));
  };

  const twoCol = (l, r) => {
    const cl = sanitize(l);
    const cr = sanitize(r);
    const sp = cols - cl.length - cr.length;
    if (sp >= 1) {
      addLine(cl + " ".repeat(sp) + cr);
    } else {
      addLine(cl);
      addLine(" ".repeat(Math.max(0, cols - cr.length)) + cr);
    }
  };

  // Header
  setAlign("center");
  setBold(true);
  addLine("[ GMK ]");
  setSize(1, 2);
  addLine(payload.restaurant?.name || "GMK Food Court");
  setSize(1, 1);
  setBold(false);
  if (payload.restaurant?.tagline) addLine(payload.restaurant.tagline);
  if (payload.restaurant?.address) addLine(payload.restaurant.address);
  const contact = [
    payload.restaurant?.phone ? `Ph: ${payload.restaurant.phone}` : "",
    payload.restaurant?.gstin ? `GSTIN: ${payload.restaurant.gstin}` : "",
  ]
    .filter(Boolean)
    .join(" | ");
  if (contact) addLine(contact);

  divider("-");

  // Metadata
  setAlign("left");
  if (payload.isReprint) {
    setAlign("center");
    setBold(true);
    addLine("*** DUPLICATE / REPRINT RECEIPT ***");
    setBold(false);
    setAlign("left");
  }

  twoCol(`Bill No: ${payload.bill.billNo}`, `Date: ${payload.bill.date}`);
  twoCol(payload.bill.tableNo ? `Table: ${payload.bill.tableNo}` : "Table: -", `Time: ${payload.bill.time}`);
  if (payload.bill.customerName) addLine(`Customer: ${payload.bill.customerName}`);

  divider("-");

  // Items Table (46 columns: 23 + 5 + 8 + 10)
  const itemW = 23;
  const qtyW = 5;
  const rateW = 8;
  const amtW = 10;

  setBold(true);
  addLine("ITEM".padEnd(itemW) + "QTY".padStart(qtyW) + "RATE".padStart(rateW) + "AMT".padStart(amtW));
  setBold(false);
  divider("-");

  for (const item of payload.items) {
    const rateStr = item.price.toFixed(0);
    const amtStr = (item.price * item.qty).toFixed(0);

    // Multi-line word wrap for long item names
    let name = item.name;
    const nameLines = [];
    while (name.length > itemW) {
      nameLines.push(name.substring(0, itemW));
      name = name.substring(itemW);
    }
    nameLines.push(name);

    for (let li = 0; li < nameLines.length; li++) {
      if (li === 0) {
        addLine(
          nameLines[li].padEnd(itemW) +
            item.qty.toString().padStart(qtyW) +
            rateStr.padStart(rateW) +
            amtStr.padStart(amtW)
        );
      } else {
        addLine(nameLines[li].padEnd(itemW));
      }
    }
  }

  divider("-");

  // Totals
  twoCol("Subtotal", `${sym} ${payload.totals.subtotal.toFixed(0)}`);
  const gstPct = payload.totals.gstRate ? `${(payload.totals.gstRate * 100).toFixed(0)}%` : "5%";
  twoCol(`GST (${gstPct})`, `${sym} ${payload.totals.gstAmount.toFixed(0)}`);
  divider("=");

  setBold(true);
  setSize(1, 2);
  twoCol("TOTAL", `${sym} ${payload.totals.grandTotal.toFixed(0)}`);
  setSize(1, 1);
  setBold(false);
  divider("-");

  // Footer
  setAlign("center");
  addLine(payload.footer?.message1 || "Thank you for dining with us!");
  addLine(payload.footer?.message2 || "Visit again");

  // Bottom Padding (+20%: 3 lines + 14 dots feed = 86 dots before cut)
  bytes.push(0x1b, 0x64, 3);
  bytes.push(0x1b, 0x4a, 14);

  if (config.autoCut !== false) {
    bytes.push(0x1d, 0x56, config.cutType === "full" ? 0x41 : 0x42, 0x00);
  }

  return Buffer.from(bytes);
}

function printViaSpooler(printerName, buffer, docName) {
  return new Promise((resolve) => {
    if (!fs.existsSync(BIN_PATH)) {
      resolve({ success: false, error: "winrawprint.exe not found" });
      return;
    }
    const proc = spawn(BIN_PATH, ["--print", printerName, docName], { timeout: 8000 });
    let stdout = "";
    proc.stdout.on("data", (c) => (stdout += c.toString()));
    proc.on("close", (code) => {
      try {
        const json = JSON.parse(stdout);
        resolve(json);
      } catch {
        resolve({ success: code === 0, error: stdout });
      }
    });
    proc.on("error", (e) => resolve({ success: false, error: e.message }));
    proc.stdin.write(buffer);
    proc.stdin.end();
  });
}

function printViaNetwork(host, port, buffer) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(8000);
    socket.on("connect", () => {
      socket.write(buffer, () => {
        socket.end(() => resolve({ success: true, bytesWritten: buffer.length }));
      });
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve({ success: false, error: "Network socket timeout" });
    });
    socket.on("error", (e) => {
      socket.destroy();
      resolve({ success: false, error: e.message });
    });
    socket.connect(port, host);
  });
}

// Sequential queue processor
async function processQueue() {
  if (isQueueProcessing || printQueue.length === 0) return;
  isQueueProcessing = true;

  while (printQueue.length > 0) {
    const item = printQueue[0];
    currentPrinterState = "PRINTING";
    const startTime = Date.now();

    try {
      const config = loadConfig();
      const buffer = buildEscpos(item.payload, config);
      let result;

      if (config.connectionType === "network") {
        result = await printViaNetwork(config.networkHost, config.networkPort, buffer);
      } else {
        result = await printViaSpooler(config.printerName, buffer, `GMK-${item.payload.bill.billNo}`);
      }

      result.durationMs = Date.now() - startTime;
      jobHistory.set(item.payload.jobId, { time: Date.now(), success: result.success });
      sendJson(item.res, result.success ? 200 : 502, result);
    } catch (err) {
      sendJson(item.res, 500, { success: false, message: err.message });
    } finally {
      printQueue.shift();
      // Hardware pause (80ms)
      await new Promise((r) => setTimeout(r, 80));
      currentPrinterState = "READY";
    }
  }

  isQueueProcessing = false;
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === "GET" && url.pathname === "/status") {
    const config = loadConfig();
    if (fs.existsSync(BIN_PATH)) {
      execFile(BIN_PATH, ["--check", config.printerName], { timeout: 3000 }, (err, stdout) => {
        try {
          const json = JSON.parse(stdout);
          const isOnline = !!json.online;
          const state = isOnline ? (isQueueProcessing ? "PRINTING" : "READY") : "DISCONNECTED";
          sendJson(res, 200, {
            online: isOnline,
            ready: isOnline && !isQueueProcessing,
            connectionState: state,
            queueLength: printQueue.length,
            printerName: config.printerName,
            connectionType: config.connectionType,
            message: isOnline ? "Printer is ready" : json.error || "Offline",
          });
        } catch {
          sendJson(res, 200, {
            online: false,
            ready: false,
            connectionState: "DISCONNECTED",
            queueLength: printQueue.length,
            message: "Could not query printer",
          });
        }
      });
    } else {
      sendJson(res, 200, {
        online: true,
        ready: true,
        connectionState: "READY",
        queueLength: printQueue.length,
        message: "Service running (Virtual mode)",
      });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/printers") {
    if (fs.existsSync(BIN_PATH)) {
      execFile(BIN_PATH, ["--list"], { timeout: 3000 }, (err, stdout) => {
        try {
          sendJson(res, 200, JSON.parse(stdout));
        } catch {
          sendJson(res, 500, { success: false, error: "Failed to list printers" });
        }
      });
    } else {
      sendJson(res, 200, { success: true, printers: ["Xprinter XP-80"] });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/print") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body);
        if (!payload.items || !payload.items.length) {
          return sendJson(res, 400, { success: false, message: "Cart is empty" });
        }

        // Duplicate check
        if (jobHistory.has(payload.jobId) && !payload.isReprint) {
          return sendJson(res, 409, {
            success: false,
            duplicate: true,
            message: `Bill ${payload.bill.billNo} was already printed. Use Reprint if needed.`,
          });
        }

        // Enqueue into sequential FIFO queue
        printQueue.push({ payload, res });
        processQueue();
      } catch (err) {
        sendJson(res, 500, { success: false, message: err.message });
      }
    });
    return;
  }

  sendJson(res, 404, { error: "Not found" });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`GMK Food Court Thermal Printing Service running on http://127.0.0.1:${PORT}`);
});
