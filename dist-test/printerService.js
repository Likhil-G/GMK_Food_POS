"use strict";
/**
 * GMK Food Court - Printer Service
 * Central coordination service: handles validation, duplicate protection,
 * sequential queue dispatching, and persistent connection monitoring.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateBillPayload = validateBillPayload;
exports.getPrinterStatus = getPrinterStatus;
exports.printBill = printBill;
exports.printTestReceipt = printTestReceipt;
const printerConfig_1 = require("./printerConfig");
const printerConnectionManager_1 = require("./printerConnectionManager");
const printQueue_1 = require("./printQueue");
const billFormatter_1 = require("./billFormatter");
const windowsSpooler_1 = require("./drivers/windowsSpooler");
const networkPrinter_1 = require("./drivers/networkPrinter");
const virtualPrinter_1 = require("./drivers/virtualPrinter");
/**
 * Validates structured bill payload
 */
function validateBillPayload(payload) {
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
async function getPrinterStatus(customConfig) {
    const baseStatus = await printerConnectionManager_1.printerConnectionManager.checkConnection();
    const connState = printerConnectionManager_1.printerConnectionManager.getState();
    const queueLen = printQueue_1.printQueue.getQueueLength();
    return {
        ...baseStatus,
        connectionState: connState,
        queueLength: queueLen,
    };
}
/**
 * Dispatches a structured bill to the sequential print queue
 */
async function printBill(payload, customConfig) {
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
    return await printQueue_1.printQueue.enqueue(payload, customConfig);
}
/**
 * Prints a test receipt to verify hardware, padding, and alignment
 */
async function printTestReceipt(customConfig) {
    const config = customConfig || (await (0, printerConfig_1.getPrinterConfig)());
    const escpos = (0, billFormatter_1.formatTestReceiptToEscpos)(config);
    const buffer = escpos.toBuffer();
    const startTime = Date.now();
    const jobId = `test_${Date.now()}`;
    let result;
    if (config.simulationMode || config.connectionType === "virtual") {
        result = await (0, virtualPrinter_1.printToVirtualPrinter)(buffer, "GMK Test Receipt");
    }
    else if (config.connectionType === "network") {
        result = await (0, networkPrinter_1.printToNetworkPrinter)(config.networkHost, config.networkPort, buffer);
    }
    else {
        result = await (0, windowsSpooler_1.printToWindowsSpooler)(config.printerName, buffer, "GMK Test Receipt");
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
