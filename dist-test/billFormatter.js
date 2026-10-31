"use strict";
/**
 * GMK Food Court - Bill Formatter
 * Translates structured BillPayload into ESC/POS thermal printer layout matching Bill.tsx.
 *
 * PADDING SPECIFICATION (Exact +20% increase on all 4 sides):
 * - Top Padding: Baseline 24 dots (3.0mm) + 20% = 29 dots (3.6mm) via ESC J 29.
 * - Bottom Padding: Baseline 72 dots (9.0mm / 3 lines) + 20% = 86 dots (10.8mm) via ESC d 3 + ESC J 14.
 * - Left Padding: Baseline 4.0mm + 20% = 4.8mm (+8 dots via GS L 8).
 * - Right Padding: Baseline 4.0mm + 20% = 4.8mm.
 * - Printable Content Width: 80mm - (4.8mm + 4.8mm) = 70.4mm (563 dots) = 46 columns (Font A).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RECEIPT_COLUMNS_80MM = void 0;
exports.formatBillToEscpos = formatBillToEscpos;
exports.formatTestReceiptToEscpos = formatTestReceiptToEscpos;
const escposBuilder_1 = require("./escposBuilder");
// Standard 80mm column width after applying +20% side padding (70.4mm printable width)
exports.RECEIPT_COLUMNS_80MM = 46;
function formatBillToEscpos(payload, config) {
    // Use 46 columns for 80mm paper roll with exact +20% horizontal padding
    const columns = config.paperWidthMm === 58 ? 32 : exports.RECEIPT_COLUMNS_80MM;
    const builder = new escposBuilder_1.EscposBuilder(columns);
    const symbol = config.currencySymbol || "Rs.";
    // Initialize printer
    builder.init();
    // 1. HORIZONTAL & TOP PADDING (+20% on Top and Left)
    if (config.paperWidthMm !== 58) {
        // Left Padding (+20%: adds 8 dots = 1.0mm hardware margin)
        builder.setLeftMargin(8);
        // Content width: 563 dots (70.4mm)
        builder.setPrintAreaWidth(563);
    }
    // Top Padding (+20%: feeds 29 dots = 3.6mm before header)
    builder.feedDots(29);
    // 2. HEADER SECTION
    builder.align("center");
    // Restaurant Logo / Tag Mark
    builder.bold(true);
    builder.line("[ GMK ]");
    // Restaurant Name (Double Height & Width for prominence)
    builder.size(1, 2);
    builder.line(payload.restaurant.name || "GMK Food Court");
    builder.size(1, 1);
    builder.bold(false);
    // Tagline
    if (payload.restaurant.tagline) {
        builder.line(payload.restaurant.tagline);
    }
    // Address & Contact info
    if (payload.restaurant.address) {
        builder.line(payload.restaurant.address);
    }
    const contactLine = [
        payload.restaurant.phone ? `Ph: ${payload.restaurant.phone}` : "",
        payload.restaurant.gstin ? `GSTIN: ${payload.restaurant.gstin}` : "",
    ].filter(Boolean).join(" | ");
    if (contactLine) {
        builder.line(contactLine);
    }
    // Divider (46 characters)
    builder.divider("-");
    // 3. METADATA SECTION (Bill info, Date, Time, Table, Customer)
    builder.align("left");
    // Duplicate / Reprint watermark
    if (payload.isReprint) {
        builder.align("center");
        builder.bold(true);
        builder.line("*** DUPLICATE / REPRINT RECEIPT ***");
        builder.bold(false);
        builder.align("left");
    }
    // Bill No & Date/Time
    builder.twoColumnRow(`Bill No: ${payload.bill.billNo}`, `Date: ${payload.bill.date}`);
    const timeStr = `Time: ${payload.bill.time}`;
    const tableStr = payload.bill.tableNo ? `Table: ${payload.bill.tableNo}` : "Table: -";
    builder.twoColumnRow(tableStr, timeStr);
    if (payload.bill.customerName && payload.bill.customerName.trim().length > 0) {
        builder.line(`Customer: ${payload.bill.customerName.trim()}`);
    }
    // Divider
    builder.divider("-");
    // 4. ITEMS TABLE SECTION
    // Column distribution for 46 columns (+20% padding):
    // Item Name: 23 | Qty: 5 | Rate: 8 | Amt: 10 = 46 chars
    const qtyColWidth = 5;
    const rateColWidth = 8;
    const amtColWidth = 10;
    const itemColWidth = Math.max(14, columns - qtyColWidth - rateColWidth - amtColWidth);
    builder.bold(true);
    builder.tableRow([
        { text: "ITEM", width: itemColWidth, align: "left" },
        { text: "QTY", width: qtyColWidth, align: "right" },
        { text: "RATE", width: rateColWidth, align: "right" },
        { text: "AMT", width: amtColWidth, align: "right" },
    ]);
    builder.bold(false);
    builder.divider("-");
    // Print each item row (handles multi-line wrapping for long dishes)
    for (const item of payload.items) {
        const rateText = item.price.toFixed(0);
        const amtText = (item.price * item.qty).toFixed(0);
        builder.tableRow([
            { text: item.name, width: itemColWidth, align: "left" },
            { text: item.qty.toString(), width: qtyColWidth, align: "right" },
            { text: rateText, width: rateColWidth, align: "right" },
            { text: amtText, width: amtColWidth, align: "right" },
        ]);
    }
    builder.divider("-");
    // 5. TOTALS SECTION
    builder.align("left");
    builder.twoColumnRow("Subtotal", `${symbol} ${payload.totals.subtotal.toFixed(0)}`);
    const gstPercentText = payload.totals.gstRate
        ? `GST (${(payload.totals.gstRate * 100).toFixed(0)}%)`
        : "GST (5%)";
    builder.twoColumnRow(gstPercentText, `${symbol} ${payload.totals.gstAmount.toFixed(0)}`);
    builder.divider("=");
    // Grand Total in Bold Double Height
    builder.bold(true);
    builder.size(1, 2);
    builder.twoColumnRow("TOTAL", `${symbol} ${payload.totals.grandTotal.toFixed(0)}`);
    builder.size(1, 1);
    builder.bold(false);
    builder.divider("-");
    // 6. FOOTER SECTION
    builder.align("center");
    if (payload.footer?.message1) {
        builder.line(payload.footer.message1);
    }
    else {
        builder.line("Thank you for dining with us!");
    }
    if (payload.footer?.message2) {
        builder.line(payload.footer.message2);
    }
    else {
        builder.line("Visit again");
    }
    // 7. DYNAMIC BOTTOM PADDING & AUTO-CUT (+20% on Bottom)
    // Baseline was 3 lines (72 dots = 9.0mm).
    // +20% = 86 dots (10.8mm): 3 lines feed + 14 dots feed before the cutter blade.
    builder.feed(3);
    builder.feedDots(14);
    // Auto-cut if enabled
    if (config.autoCut) {
        builder.cut(config.cutType === "partial");
    }
    // Kick cash drawer if enabled
    if (config.openCashDrawer) {
        builder.cashDrawer();
    }
    return builder;
}
/**
 * Creates a test print receipt for hardware verification and alignment testing
 */
function formatTestReceiptToEscpos(config) {
    const columns = config.paperWidthMm === 58 ? 32 : exports.RECEIPT_COLUMNS_80MM;
    const builder = new escposBuilder_1.EscposBuilder(columns);
    builder.init();
    if (config.paperWidthMm !== 58) {
        builder.setLeftMargin(8);
        builder.setPrintAreaWidth(563);
    }
    builder.feedDots(29); // +20% top padding
    builder.align("center");
    builder.bold(true);
    builder.size(1, 2);
    builder.line("GMK FOOD COURT");
    builder.size(1, 1);
    builder.line("PRINTER HARDWARE TEST");
    builder.bold(false);
    builder.divider("=");
    builder.align("left");
    builder.line(`Target: ${config.printerName}`);
    builder.line(`Type: ${config.connectionType.toUpperCase()}`);
    builder.line(`Paper Width: ${config.paperWidthMm}mm (${columns} cols)`);
    builder.line(`Auto-Cut: ${config.autoCut ? "ENABLED (" + config.cutType + ")" : "DISABLED"}`);
    builder.line(`Date: ${new Date().toLocaleString("en-IN")}`);
    builder.divider("-");
    builder.line("Alignment Verification:");
    builder.tableRow([
        { text: "LEFT", width: 11, align: "left" },
        { text: "CENTER", width: 24, align: "center" },
        { text: "RIGHT", width: 11, align: "right" },
    ]);
    builder.divider("-");
    builder.align("center");
    builder.bold(true);
    builder.line("TEST SUCCESSFUL - READY TO PRINT");
    builder.bold(false);
    // Bottom padding (+20%)
    builder.feed(3);
    builder.feedDots(14);
    if (config.autoCut) {
        builder.cut(config.cutType === "partial");
    }
    return builder;
}
