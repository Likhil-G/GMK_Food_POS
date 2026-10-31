/**
 * GMK Food Court - Sequential Print Queue
 * Ensures reliable, serialized thermal receipt printing with FIFO queueing,
 * state recovery, duplicate prevention, and zero dropped jobs.
 */

import { BillPayload, PrinterConfig, PrintJobResult } from "./printTypes";
import { printerConnectionManager } from "./printerConnectionManager";
import { formatBillToEscpos } from "./billFormatter";
import { getPrinterConfig } from "./printerConfig";
import { printToWindowsSpooler } from "./drivers/windowsSpooler";
import { printToNetworkPrinter } from "./drivers/networkPrinter";
import { printToVirtualPrinter } from "./drivers/virtualPrinter";

export interface QueuedPrintJob {
  jobId: string;
  payload: BillPayload;
  submittedAt: number;
  resolve: (result: PrintJobResult) => void;
  reject: (err: any) => void;
}

// In-memory duplicate protection registry
interface PastJobRecord {
  timestamp: number;
  success: boolean;
  billNo: string;
}

const jobHistory = new Map<string, PastJobRecord>();
const DEDUP_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

function cleanupOldJobs() {
  const now = Date.now();
  jobHistory.forEach((rec, id) => {
    if (now - rec.timestamp > DEDUP_WINDOW_MS) {
      jobHistory.delete(id);
    }
  });
}

class PrintQueue {
  private static instance: PrintQueue;
  private queue: QueuedPrintJob[] = [];
  private isProcessing: boolean = false;

  private constructor() {
    // Listen for connection restored to resume queued jobs
    printerConnectionManager.onStateChange((state) => {
      if ((state === "READY" || state === "CONNECTED") && this.queue.length > 0 && !this.isProcessing) {
        this.processQueue();
      }
    });
  }

  public static getInstance(): PrintQueue {
    if (!PrintQueue.instance) {
      PrintQueue.instance = new PrintQueue();
    }
    return PrintQueue.instance;
  }

  public getQueueLength(): number {
    return this.queue.length;
  }

  public isBusy(): boolean {
    return this.isProcessing || this.queue.length > 0;
  }

  /**
   * Enqueue a bill print request for sequential transmission
   */
  public enqueue(payload: BillPayload, customConfig?: PrinterConfig): Promise<PrintJobResult> {
    cleanupOldJobs();

    // 1. Duplicate Print Protection: check both in-flight queue and recent job history
    const isAlreadyQueued = this.queue.some((j) => j.jobId === payload.jobId);
    const existingJob = jobHistory.get(payload.jobId);

    if ((isAlreadyQueued || existingJob) && !payload.isReprint) {
      return Promise.resolve({
        success: false,
        duplicate: true,
        jobId: payload.jobId,
        printerName: "XP-S300N",
        connectionType: "windows-spooler",
        message: `Duplicate print request: Bill ${payload.bill.billNo} was already submitted ${Math.round(
          existingJob ? (Date.now() - existingJob.timestamp) / 1000 : 0
        )}s ago. Use 'Reprint' if intended.`,
        error: "DUPLICATE_JOB",
      });
    }

    return new Promise<PrintJobResult>((resolve, reject) => {
      this.queue.push({
        jobId: payload.jobId,
        payload,
        submittedAt: Date.now(),
        resolve,
        reject,
      });

      // Start processing if not currently busy
      if (!this.isProcessing) {
        this.processQueue(customConfig);
      }
    });
  }

  /**
   * Sequential queue worker: processes one job at a time in strict FIFO order
   */
  private async processQueue(customConfig?: PrinterConfig) {
    if (this.isProcessing) return;
    if (this.queue.length === 0) return;

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const job = this.queue[0]; // Peek at head
      const startTime = Date.now();

      // Check if printer is disconnected; wait if needed without dropping the job
      const state = printerConnectionManager.getState();
      if (state === "DISCONNECTED" && !customConfig?.simulationMode) {
        // Probe connection once before pausing
        const status = await printerConnectionManager.checkConnection(true);
        if (!status.online && status.connectionType !== "virtual") {
          // Keep job in queue and pause processing until connection recovers
          this.isProcessing = false;
          return;
        }
      }

      // Mark printer as PRINTING
      printerConnectionManager.setState("PRINTING", `Printing bill ${job.payload.bill.billNo}...`);

      let result: PrintJobResult;

      try {
        const config = customConfig || (await getPrinterConfig());
        const escpos = formatBillToEscpos(job.payload, config);
        const buffer = escpos.toBuffer();
        const docName = `GMK-${job.payload.bill.billNo}`;

        let driverResult: {
          success: boolean;
          bytesWritten?: number;
          message: string;
          simulatedReceiptText?: string;
          error?: string;
        };

        if (config.simulationMode || config.connectionType === "virtual") {
          driverResult = await printToVirtualPrinter(buffer, docName);
        } else if (config.connectionType === "network") {
          driverResult = await printToNetworkPrinter(config.networkHost, config.networkPort, buffer);
        } else {
          // Windows Spooler with retry for port-busy conditions
          driverResult = await this.printWithSpoolerRetry(config.printerName, buffer, docName);
        }

        const durationMs = Date.now() - startTime;

        result = {
          success: driverResult.success,
          jobId: job.jobId,
          printerName:
            config.connectionType === "network"
              ? `${config.networkHost}:${config.networkPort}`
              : config.printerName,
          connectionType: config.connectionType,
          bytesWritten: driverResult.bytesWritten || buffer.length,
          durationMs,
          message: driverResult.message,
          simulatedReceiptText: driverResult.simulatedReceiptText,
          error: driverResult.error,
        };

        // Record in past job history
        jobHistory.set(job.jobId, {
          timestamp: Date.now(),
          success: result.success,
          billNo: job.payload.bill.billNo,
        });

        // Settle promise
        job.resolve(result);
      } catch (err: any) {
        result = {
          success: false,
          jobId: job.jobId,
          printerName: "XP-S300N",
          connectionType: "windows-spooler",
          message: `Print failed: ${err.message}`,
          error: err.message,
        };
        job.resolve(result);
      } finally {
        // Remove processed job from queue
        this.queue.shift();

        // Allow 80ms hardware buffer stabilization before next physical print
        await new Promise((r) => setTimeout(r, 80));

        // Reset printer state to READY
        printerConnectionManager.setState("READY", "Printer ready for next bill.");
      }
    }

    this.isProcessing = false;
  }

  /**
   * Retries Windows Spooler print if port is temporarily busy (e.g. error 170)
   */
  private async printWithSpoolerRetry(
    printerName: string,
    buffer: Buffer,
    docName: string
  ): Promise<{ success: boolean; bytesWritten?: number; message: string; error?: string }> {
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      attempts++;
      const res = await printToWindowsSpooler(printerName, buffer, docName);
      if (res.success) {
        return res;
      }

      // If failed due to busy port, wait 120ms and retry
      if (attempts < maxAttempts && (res.error?.includes("busy") || res.error?.includes("170"))) {
        await new Promise((r) => setTimeout(r, 120));
      } else {
        return res;
      }
    }

    return {
      success: false,
      message: `Failed after ${maxAttempts} attempts to spool to ${printerName}`,
      error: "SPOOLER_BUSY_TIMEOUT",
    };
  }
}

export const printQueue = PrintQueue.getInstance();
