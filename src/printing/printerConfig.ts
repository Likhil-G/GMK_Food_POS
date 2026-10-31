/**
 * GMK Food Court - Printer Configuration Manager
 * Loads, validates, auto-discovers, and persists thermal printer settings.
 */

import * as fs from "fs";
import * as path from "path";
import { PrinterConfig } from "./printTypes";
import { listWindowsPrinters } from "./drivers/windowsSpooler";

const CONFIG_FILE_PATH = path.resolve(process.cwd(), "printer-config.json");

export const DEFAULT_PRINTER_CONFIG: PrinterConfig = {
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

let cachedConfig: PrinterConfig | null = null;

/**
 * Loads current printer configuration, auto-discovering installed Xprinter if needed
 */
export async function getPrinterConfig(): Promise<PrinterConfig> {
  if (cachedConfig) {
    return { ...cachedConfig };
  }

  let loaded: Partial<PrinterConfig> = {};

  try {
    if (fs.existsSync(CONFIG_FILE_PATH)) {
      const data = await fs.promises.readFile(CONFIG_FILE_PATH, "utf8");
      loaded = JSON.parse(data);
    }
  } catch (err) {
    console.warn("Could not read printer-config.json, using defaults", err);
  }

  const config: PrinterConfig = {
    ...DEFAULT_PRINTER_CONFIG,
    ...loaded,
  };

  // If no printerName set or default doesn't exist, try auto-discovering Xprinter XP-80 / XP-S300N
  try {
    const installed = await listWindowsPrinters();
    if (installed.length > 0) {
      const xprinter = installed.find((p) =>
        /xprinter|xp-s300|xp-80|pos-80|thermal/i.test(p)
      );
      if (xprinter && (!loaded.printerName || !installed.includes(config.printerName))) {
        config.printerName = xprinter;
      }
    }
  } catch {
    // Keep configured or default name
  }

  cachedConfig = config;
  return { ...config };
}

/**
 * Updates and persists printer configuration
 */
export async function savePrinterConfig(updates: Partial<PrinterConfig>): Promise<PrinterConfig> {
  const current = await getPrinterConfig();
  const updated: PrinterConfig = {
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
  } catch (err) {
    console.error("Failed to write printer-config.json:", err);
  }

  cachedConfig = updated;
  return { ...updated };
}

