"use strict";
/**
 * GMK Food Court - Printer Configuration Manager
 * Loads, validates, auto-discovers, and persists thermal printer settings.
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
exports.DEFAULT_PRINTER_CONFIG = void 0;
exports.getPrinterConfig = getPrinterConfig;
exports.savePrinterConfig = savePrinterConfig;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const windowsSpooler_1 = require("./drivers/windowsSpooler");
const CONFIG_FILE_PATH = path.resolve(process.cwd(), "printer-config.json");
exports.DEFAULT_PRINTER_CONFIG = {
    connectionType: "windows-spooler",
    printerName: "Xprinter XP-80",
    networkHost: "192.168.1.100",
    networkPort: 9100,
    paperWidthMm: 80,
    columns: 48,
    autoCut: true,
    cutType: "partial",
    openCashDrawer: false,
    currencySymbol: "Rs.",
    feedLinesBeforeCut: 3,
    simulationMode: false,
};
let cachedConfig = null;
/**
 * Loads current printer configuration, auto-discovering installed Xprinter if needed
 */
async function getPrinterConfig() {
    if (cachedConfig) {
        return { ...cachedConfig };
    }
    let loaded = {};
    try {
        if (fs.existsSync(CONFIG_FILE_PATH)) {
            const data = await fs.promises.readFile(CONFIG_FILE_PATH, "utf8");
            loaded = JSON.parse(data);
        }
    }
    catch (err) {
        console.warn("Could not read printer-config.json, using defaults", err);
    }
    const config = {
        ...exports.DEFAULT_PRINTER_CONFIG,
        ...loaded,
    };
    // If no printerName set or default doesn't exist, try auto-discovering Xprinter XP-80 / XP-S300N
    try {
        const installed = await (0, windowsSpooler_1.listWindowsPrinters)();
        if (installed.length > 0) {
            const xprinter = installed.find((p) => /xprinter|xp-s300|xp-80|pos-80|thermal/i.test(p));
            if (xprinter && (!loaded.printerName || !installed.includes(config.printerName))) {
                config.printerName = xprinter;
            }
        }
    }
    catch {
        // Keep configured or default name
    }
    cachedConfig = config;
    return { ...config };
}
/**
 * Updates and persists printer configuration
 */
async function savePrinterConfig(updates) {
    const current = await getPrinterConfig();
    const updated = {
        ...current,
        ...updates,
    };
    // Basic validation
    if (updated.paperWidthMm !== 80 && updated.paperWidthMm !== 58) {
        updated.paperWidthMm = 80;
    }
    if (!updated.columns || updated.columns <= 20) {
        updated.columns = updated.paperWidthMm === 58 ? 32 : 48;
    }
    try {
        await fs.promises.writeFile(CONFIG_FILE_PATH, JSON.stringify(updated, null, 2), "utf8");
    }
    catch (err) {
        console.error("Failed to write printer-config.json:", err);
    }
    cachedConfig = updated;
    return { ...updated };
}
