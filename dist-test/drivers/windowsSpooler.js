"use strict";
/**
 * GMK Food Court - Windows Spooler Driver
 * Sends RAW ESC/POS byte streams directly to Windows thermal printer spooler (USB/Driver).
 * Bypasses Windows GDI/XPS driver rendering, print dialogs, and fixed page margins.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.listWindowsPrinters = listWindowsPrinters;
exports.checkWindowsPrinter = checkWindowsPrinter;
exports.printToWindowsSpooler = printToWindowsSpooler;
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
// Determine path to native winrawprint.exe and fallback rawprint.ps1
function getBinPaths() {
    const baseDir = path.resolve(process.cwd(), "src", "printing", "bin");
    const exePath = path.join(baseDir, "winrawprint.exe");
    const ps1Path = path.join(baseDir, "rawprint.ps1");
    return { exePath, ps1Path };
}
/**
 * List all installed Windows printers
 */
async function listWindowsPrinters() {
    const { exePath, ps1Path } = getBinPaths();
    // Try native binary first (< 20ms)
    if (fs.existsSync(exePath)) {
        try {
            const output = await new Promise((resolve, reject) => {
                (0, child_process_1.execFile)(exePath, ["--list"], { timeout: 3000 }, (err, stdout) => {
                    if (err)
                        reject(err);
                    else
                        resolve(stdout);
                });
            });
            const data = JSON.parse(output);
            if (Array.isArray(data.printers)) {
                return data.printers;
            }
        }
        catch {
            // Fallback to powershell below
        }
    }
    // Fallback to PowerShell
    if (fs.existsSync(ps1Path)) {
        try {
            const output = await new Promise((resolve, reject) => {
                (0, child_process_1.execFile)("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1Path, "-Action", "list"], { timeout: 5000 }, (err, stdout) => {
                    if (err)
                        reject(err);
                    else
                        resolve(stdout);
                });
            });
            const data = JSON.parse(output);
            if (Array.isArray(data.printers)) {
                return data.printers;
            }
        }
        catch {
            // Return empty list on failure
        }
    }
    return [];
}
/**
 * Check if a Windows printer is reachable/openable
 */
async function checkWindowsPrinter(printerName) {
    if (!printerName) {
        return { online: false, message: "No printer name specified" };
    }
    const { exePath, ps1Path } = getBinPaths();
    if (fs.existsSync(exePath)) {
        try {
            const output = await new Promise((resolve, reject) => {
                (0, child_process_1.execFile)(exePath, ["--check", printerName], { timeout: 3000 }, (err, stdout) => {
                    if (err && !stdout)
                        reject(err);
                    else
                        resolve(stdout);
                });
            });
            const data = JSON.parse(output);
            return {
                online: !!data.online,
                message: data.online ? `Printer '${printerName}' is online and ready.` : (data.error || "Printer not responding"),
            };
        }
        catch (err) {
            // Continue to fallback
        }
    }
    // Fallback to PowerShell
    if (fs.existsSync(ps1Path)) {
        try {
            const output = await new Promise((resolve, reject) => {
                (0, child_process_1.execFile)("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1Path, "-Action", "check", "-PrinterName", printerName], { timeout: 5000 }, (err, stdout) => {
                    if (err && !stdout)
                        reject(err);
                    else
                        resolve(stdout);
                });
            });
            const data = JSON.parse(output);
            return {
                online: !!data.online,
                message: data.online ? `Printer '${printerName}' is online.` : (data.error || "Printer offline"),
            };
        }
        catch (err) {
            return { online: false, message: `Check failed: ${err.message}` };
        }
    }
    return { online: false, message: "Printer helper tools not found" };
}
/**
 * Send raw binary ESC/POS buffer directly to Windows printer spooler
 */
async function printToWindowsSpooler(printerName, buffer, docName = "GMK Receipt") {
    if (!printerName) {
        return { success: false, bytesWritten: 0, message: "Printer name is required", error: "PRINTER_NAME_REQUIRED" };
    }
    const { exePath, ps1Path } = getBinPaths();
    // 1. Primary method: High-performance native winrawprint.exe
    if (fs.existsSync(exePath)) {
        try {
            const result = await new Promise((resolve) => {
                const proc = (0, child_process_1.spawn)(exePath, ["--print", printerName, docName], {
                    stdio: ["pipe", "pipe", "pipe"],
                    timeout: 8000,
                });
                let stdout = "";
                let stderr = "";
                proc.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
                proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
                proc.on("close", (code) => {
                    resolve({ stdout, exitCode: code ?? 1 });
                });
                proc.on("error", (err) => {
                    resolve({ stdout: JSON.stringify({ success: false, error: err.message }), exitCode: 99 });
                });
                // Write buffer to stdin
                proc.stdin.write(buffer);
                proc.stdin.end();
            });
            if (result.stdout) {
                try {
                    const parsed = JSON.parse(result.stdout.trim());
                    if (parsed.success) {
                        return {
                            success: true,
                            bytesWritten: parsed.bytesWritten || buffer.length,
                            message: `Printed ${parsed.bytesWritten || buffer.length} bytes to ${printerName}`,
                        };
                    }
                    else {
                        // If binary reported error, let's also check if fallback should be tried
                        if (result.exitCode === 0) {
                            return { success: false, bytesWritten: 0, message: parsed.error, error: parsed.error };
                        }
                    }
                }
                catch {
                    // parse error, fallback
                }
            }
        }
        catch {
            // Continue to PowerShell fallback
        }
    }
    // 2. Secondary fallback: PowerShell Spooler Helper
    if (fs.existsSync(ps1Path)) {
        const tempFilePath = path.join(os.tmpdir(), `gmk_print_${Date.now()}_${Math.random().toString(36).slice(2)}.bin`);
        try {
            await fs.promises.writeFile(tempFilePath, buffer);
            const output = await new Promise((resolve, reject) => {
                (0, child_process_1.execFile)("powershell.exe", [
                    "-NoProfile",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-File",
                    ps1Path,
                    "-Action",
                    "print",
                    "-PrinterName",
                    printerName,
                    "-DocName",
                    docName,
                    "-InputFile",
                    tempFilePath,
                ], { timeout: 10000 }, (err, stdout) => {
                    if (err && !stdout)
                        reject(err);
                    else
                        resolve(stdout);
                });
            });
            const parsed = JSON.parse(output.trim());
            if (parsed.success) {
                return {
                    success: true,
                    bytesWritten: parsed.bytesWritten || buffer.length,
                    message: `Printed ${parsed.bytesWritten || buffer.length} bytes to ${printerName}`,
                };
            }
            else {
                return {
                    success: false,
                    bytesWritten: 0,
                    message: parsed.error || "PowerShell spooler failed",
                    error: parsed.error,
                };
            }
        }
        catch (err) {
            return { success: false, bytesWritten: 0, message: err.message, error: err.message };
        }
        finally {
            // Clean up temp file
            fs.promises.unlink(tempFilePath).catch(() => { });
        }
    }
    return {
        success: false,
        bytesWritten: 0,
        message: "No raw print driver available on this system",
        error: "NO_DRIVER_AVAILABLE",
    };
}
