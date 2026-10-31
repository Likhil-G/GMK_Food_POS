/**
 * GMK Food Court - Printer Connection Manager
 * Manages persistent printer connection lifecycle, heartbeat health monitoring,
 * and automatic reconnection recovery.
 *
 * Required Statuses:
 * - CONNECTING
 * - CONNECTED
 * - READY
 * - PRINTING
 * - DISCONNECTED
 * - ERROR
 */

import { ConnectionType, PrinterConfig, PrinterStatus } from "./printTypes";
import { getPrinterConfig } from "./printerConfig";
import { checkWindowsPrinter, listWindowsPrinters } from "./drivers/windowsSpooler";
import { checkNetworkPrinter } from "./drivers/networkPrinter";

export type ConnectionState =
  | "CONNECTING"
  | "CONNECTED"
  | "READY"
  | "PRINTING"
  | "DISCONNECTED"
  | "ERROR";

export type StateChangeCallback = (state: ConnectionState, message: string) => void;

class PrinterConnectionManager {
  private static instance: PrinterConnectionManager;
  private currentState: ConnectionState = "CONNECTING";
  private currentMessage: string = "Initializing printer connection...";
  private lastCheckedTimestamp: number = 0;
  private listeners: Set<StateChangeCallback> = new Set();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private isChecking: boolean = false;
  private failureCount: number = 0;

  private constructor() {
    this.startHeartbeat();
  }

  public static getInstance(): PrinterConnectionManager {
    if (!PrinterConnectionManager.instance) {
      PrinterConnectionManager.instance = new PrinterConnectionManager();
    }
    return PrinterConnectionManager.instance;
  }

  public getState(): ConnectionState {
    return this.currentState;
  }

  public getMessage(): string {
    return this.currentMessage;
  }

  public isReadyToPrint(): boolean {
    return this.currentState === "READY" || this.currentState === "CONNECTED";
  }

  public setState(newState: ConnectionState, message?: string) {
    const oldState = this.currentState;
    this.currentState = newState;
    if (message) {
      this.currentMessage = message;
    }

    if (oldState !== newState) {
      this.notifyListeners();
    }
  }

  public onStateChange(cb: StateChangeCallback): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => {
      try {
        listener(this.currentState, this.currentMessage);
      } catch (err) {
        console.error("Listener error:", err);
      }
    });
  }

  /**
   * Initializes or verifies printer connection
   */
  public async checkConnection(force: boolean = false): Promise<PrinterStatus> {
    // If currently printing, do not interfere with spooler
    if (this.currentState === "PRINTING" && !force) {
      return this.buildStatusObject(true, "Printer is actively printing.");
    }

    if (this.isChecking) {
      return this.buildStatusObject(this.isReadyToPrint(), this.currentMessage);
    }

    this.isChecking = true;

    try {
      const config = await getPrinterConfig();
      const now = Date.now();
      this.lastCheckedTimestamp = now;

      if (config.simulationMode || config.connectionType === "virtual") {
        this.failureCount = 0;
        this.setState("READY", "Virtual printer simulator ready.");
        return this.buildStatusObject(true, "Virtual simulation mode ready.");
      }

      if (config.connectionType === "network") {
        const netRes = await checkNetworkPrinter(config.networkHost, config.networkPort);
        if (netRes.online) {
          this.failureCount = 0;
          this.setState("READY", `Network printer ready at ${config.networkHost}:${config.networkPort}`);
          return this.buildStatusObject(true, netRes.message);
        } else {
          this.failureCount++;
          const state: ConnectionState = this.failureCount >= 2 ? "DISCONNECTED" : "CONNECTING";
          this.setState(state, netRes.message);
          return this.buildStatusObject(false, netRes.message);
        }
      }

      // Windows Spooler (USB/Driver)
      const installedPrinters = await listWindowsPrinters();
      const isInstalled = installedPrinters.some(
        (p) => p.toLowerCase() === config.printerName.toLowerCase()
      );

      if (!isInstalled) {
        this.failureCount++;
        const msg = `Printer '${config.printerName}' not found in installed printers.`;
        this.setState("DISCONNECTED", msg);
        return this.buildStatusObject(false, msg, installedPrinters);
      }

      const spoolerCheck = await checkWindowsPrinter(config.printerName);
      if (spoolerCheck.online) {
        this.failureCount = 0;
        // If we were previously disconnected or connecting, transition to CONNECTED -> READY
        this.setState("READY", `Printer '${config.printerName}' is online and ready.`);
        return this.buildStatusObject(true, spoolerCheck.message, installedPrinters);
      } else {
        this.failureCount++;
        const state: ConnectionState = this.failureCount >= 2 ? "DISCONNECTED" : "CONNECTING";
        this.setState(state, spoolerCheck.message);
        return this.buildStatusObject(false, spoolerCheck.message, installedPrinters);
      }
    } catch (err: any) {
      this.failureCount++;
      const msg = `Printer connection error: ${err.message}`;
      this.setState("ERROR", msg);
      return this.buildStatusObject(false, msg);
    } finally {
      this.isChecking = false;
    }
  }

  private buildStatusObject(
    online: boolean,
    message: string,
    installedPrinters?: string[]
  ): PrinterStatus {
    return {
      online,
      ready: this.isReadyToPrint(),
      connectionType: "windows-spooler",
      printerName: "XP-S300N / XP-80",
      message,
      details: {
        installedPrinters,
      },
      timestamp: Date.now(),
    };
  }

  /**
   * Periodic background health monitor and auto-recovery routine
   */
  private startHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

    // Initial check
    this.checkConnection();

    // Recheck every 3.5 seconds
    this.heartbeatTimer = setInterval(async () => {
      // Do not run background probe if actively printing
      if (this.currentState === "PRINTING") return;
      await this.checkConnection();
    }, 3500);
  }

  public stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}

export const printerConnectionManager = PrinterConnectionManager.getInstance();
