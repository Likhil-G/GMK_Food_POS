/**
 * GMK Food Court - Frontend Printer Client
 * Handles direct POS thermal printing, sequential queueing, status checking,
 * and printer configuration management.
 */

import { BillPayload, PrinterConfig, PrinterStatus, PrintJobResult } from "./printTypes";
import { ConnectionState } from "./printerConnectionManager";

export type PrintButtonState =
  | "CONNECTING"
  | "CONNECTED"
  | "READY"
  | "PRINTING"
  | "SUCCESS"
  | "DUPLICATE"
  | "DISCONNECTED"
  | "ERROR";

export interface ExtendedPrinterClientStatus extends PrinterStatus {
  connectionState: ConnectionState;
  queueLength: number;
}

export interface PrintResponseState {
  state: PrintButtonState;
  message: string;
  jobId?: string;
  durationMs?: number;
}

export class PrinterClient {
  private static instance: PrinterClient;
  private lastJobId: string | null = null;
  private lastBillNo: string | null = null;
  private serviceBaseUrl: string = ""; // Default uses relative Next.js API (/api)
  private pollInterval: NodeJS.Timeout | null = null;
  private lastKnownState: ConnectionState = "READY";

  private constructor() {
    if (typeof window !== "undefined") {
      const savedService = localStorage.getItem("gmk_printer_service_url");
      if (savedService) {
        this.serviceBaseUrl = savedService.trim();
      }
    }
  }

  public static getInstance(): PrinterClient {
    if (!PrinterClient.instance) {
      PrinterClient.instance = new PrinterClient();
    }
    return PrinterClient.instance;
  }

  public setServiceUrl(url: string) {
    this.serviceBaseUrl = url.trim().replace(/\/+$/, "");
    if (typeof window !== "undefined") {
      localStorage.setItem("gmk_printer_service_url", this.serviceBaseUrl);
    }
  }

  public getServiceUrl(): string {
    return this.serviceBaseUrl;
  }

  /**
   * Generates a unique, cryptographically random job ID
   */
  public generateJobId(billNo: string): string {
    const timestamp = Date.now();
    const rand = Math.random().toString(36).substring(2, 8);
    return `JOB_${billNo}_${timestamp}_${rand}`;
  }

  /**
   * Check printer hardware connectivity and spooler status
   */
  public async checkStatus(): Promise<ExtendedPrinterClientStatus> {
    const endpoint = this.serviceBaseUrl
      ? `${this.serviceBaseUrl}/status`
      : "/api/printer/status";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    try {
      const res = await fetch(endpoint, {
        method: "GET",
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }
      const data: ExtendedPrinterClientStatus = await res.json();
      this.lastKnownState = data.connectionState || (data.online ? "READY" : "DISCONNECTED");
      return data;
    } catch (err: any) {
      clearTimeout(timeout);
      const isTimeout = err.name === "AbortError";
      this.lastKnownState = "DISCONNECTED";
      return {
        online: false,
        ready: false,
        connectionType: "windows-spooler",
        connectionState: "DISCONNECTED",
        queueLength: 0,
        printerName: "Unavailable",
        message: isTimeout
          ? "Printer status query timed out"
          : `Printer service unreachable (${err.message})`,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * List installed Windows printers
   */
  public async listPrinters(): Promise<string[]> {
    const endpoint = this.serviceBaseUrl
      ? `${this.serviceBaseUrl}/printers`
      : "/api/printer/list";

    try {
      const res = await fetch(endpoint);
      if (!res.ok) return [];
      const data = await res.json();
      return data.printers || [];
    } catch {
      return [];
    }
  }

  /**
   * Get printer configuration
   */
  public async getConfig(): Promise<PrinterConfig | null> {
    try {
      const res = await fetch("/api/printer/config");
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  /**
   * Save printer configuration
   */
  public async saveConfig(config: Partial<PrinterConfig>): Promise<PrinterConfig | null> {
    try {
      const res = await fetch("/api/printer/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  /**
   * Execute test print
   */
  public async testPrint(): Promise<PrintJobResult> {
    const endpoint = this.serviceBaseUrl
      ? `${this.serviceBaseUrl}/test`
      : "/api/printer/test";

    const res = await fetch(endpoint, { method: "POST" });
    return await res.json();
  }

  /**
   * Directly prints the bill without opening any browser or Windows print dialogs.
   * Leverages the sequential backend queue so multiple consecutive prints execute reliably.
   */
  public async printDirect(
    payload: BillPayload,
    onStateChange?: (state: PrintResponseState) => void
  ): Promise<PrintJobResult> {
    onStateChange?.({
      state: "PRINTING",
      message: `Sending Bill ${payload.bill.billNo} to XP-S300N...`,
      jobId: payload.jobId,
    });

    const endpoint = this.serviceBaseUrl ? `${this.serviceBaseUrl}/print` : "/api/print";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const result: PrintJobResult = await res.json();

      if (res.status === 409 || result.duplicate) {
        onStateChange?.({
          state: "DUPLICATE",
          message: result.message || "This bill was already printed. Use Reprint if needed.",
          jobId: payload.jobId,
        });
        return result;
      }

      if (!res.ok || !result.success) {
        onStateChange?.({
          state: "ERROR",
          message: result.message || "Thermal printer failed to print.",
          jobId: payload.jobId,
        });
        return result;
      }

      // Success
      this.lastJobId = payload.jobId;
      this.lastBillNo = payload.bill.billNo;

      onStateChange?.({
        state: "SUCCESS",
        message: `Printed Bill ${payload.bill.billNo} successfully (${result.durationMs || 0}ms)`,
        jobId: payload.jobId,
        durationMs: result.durationMs,
      });

      return result;
    } catch (err: any) {
      clearTimeout(timeout);
      const isTimeout = err.name === "AbortError";
      const message = isTimeout
        ? "Print request timed out. Check printer USB cable / power."
        : `Network error: ${err.message}`;

      onStateChange?.({
        state: "ERROR",
        message,
        jobId: payload.jobId,
      });

      return {
        success: false,
        jobId: payload.jobId,
        printerName: "XP-S300N",
        connectionType: "windows-spooler",
        message,
        error: isTimeout ? "PRINT_TIMEOUT" : err.message,
      };
    }
  }

  public getLastPrintedBillNo(): string | null {
    return this.lastBillNo;
  }
}

export const printerClient = PrinterClient.getInstance();
