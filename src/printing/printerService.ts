/**
 * GMK Food Court - Printer Service
 * Central coordination service: handles validation, duplicate protection,
 * sequential queue dispatching, and persistent connection monitoring.
 */

import { BillPayload, PrinterConfig, PrinterStatus, PrintJobResult } from "./printTypes";
import { getPrinterConfig } from "./printerConfig";
import { printerConnectionManager, ConnectionState } from "./printerConnectionManager";
import { printQueue } from "./printQueue";
import { formatTestReceiptToEscpos } from "./billFormatter";
import { printToWindowsSpooler } from "./drivers/windowsSpooler";
import { printToNetworkPrinter } from "./drivers/networkPrinter";
import { printToVirtualPrinter } from "./drivers/virtualPrinter";

export interface ExtendedPrinterStatus extends PrinterStatus {
  connectionState: ConnectionState;
  queueLength: number;
}

/**
 * Validates structured bill payload
 */
export function validateBillPayload(payload: any): { valid: boolean; error?: string } {
  if (!payload || typeof payload !== "object") {
    return { valid: false, error: "Invalid payload: must be an object" };
  }

  if (!payload.jobId || typeof payload.jobId !== "string") {
    return { valid: false, error: "Missing or invalid jobId" };
  }

  if (!payload.restaurant || !payload.restaurant.name) {
    return { valid: false, error: "Missing restaurant information" };
  }

  if (!payload.bill || !payload.bill.billNo) {
    return { valid: false, error: "Missing bill metadata (billNo)" };
  }

  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    return { valid: false, error: "Cannot print an empty bill: cart contains no items" };
  }

  for (let i = 0; i < payload.items.length; i++) {
    const item = payload.items[i];
    if (!item.name || typeof item.name !== "string") {
      return { valid: false, error: `Item at index ${i} has invalid name` };
    }
    if (typeof item.qty !== "number" || item.qty <= 0) {
      return { valid: false, error: `Item '${item.name}' has invalid quantity (${item.qty})` };
    }
    if (typeof item.price !== "number" || item.price < 0) {
      return { valid: false, error: `Item '${item.name}' has invalid price (${item.price})` };
    }
  }

  if (!payload.totals || typeof payload.totals.grandTotal !== "number") {
    return { valid: false, error: "Missing or invalid totals data" };
  }

  return { valid: true };
}

/**
 * Checks current printer status and hardware connectivity
 */
export async function getPrinterStatus(customConfig?: PrinterConfig): Promise<ExtendedPrinterStatus> {
  const baseStatus = await printerConnectionManager.checkConnection();
  const connState = printerConnectionManager.getState();
  const queueLen = printQueue.getQueueLength();

  return {
    ...baseStatus,
    connectionState: connState,
    queueLength: queueLen,
  };
}

/**
 * Dispatches a structured bill to the sequential print queue
 */
export async function printBill(
  payload: BillPayload,
  customConfig?: PrinterConfig
): Promise<PrintJobResult> {
  // 1. Validate payload
  const validation = validateBillPayload(payload);
  if (!validation.valid) {
    return {
      success: false,
      jobId: payload?.jobId || "unknown",
      printerName: "None",
      connectionType: "windows-spooler",
      message: validation.error || "Validation failed",
      error: validation.error,
    };
  }

  // 2. Delegate to sequential FIFO print queue
  return await printQueue.enqueue(payload, customConfig);
}

/**
 * Prints a test receipt to verify hardware, padding, and alignment
 */
export async function printTestReceipt(customConfig?: PrinterConfig): Promise<PrintJobResult> {
  const config = customConfig || (await getPrinterConfig());
  const escpos = formatTestReceiptToEscpos(config);
  const buffer = escpos.toBuffer();
  const startTime = Date.now();
  const jobId = `test_${Date.now()}`;

  let result: { success: boolean; bytesWritten?: number; message: string; simulatedReceiptText?: string; error?: string };

  if (config.simulationMode || config.connectionType === "virtual") {
    result = await printToVirtualPrinter(buffer, "GMK Test Receipt");
  } else if (config.connectionType === "network") {
    result = await printToNetworkPrinter(config.networkHost, config.networkPort, buffer);
  } else {
    result = await printToWindowsSpooler(config.printerName, buffer, "GMK Test Receipt");
  }

  return {
    success: result.success,
    jobId,
    printerName: config.printerName,
    connectionType: config.connectionType,
    bytesWritten: result.bytesWritten || buffer.length,
    durationMs: Date.now() - startTime,
    message: result.message,
    simulatedReceiptText: result.simulatedReceiptText,
    error: result.error,
  };
}
