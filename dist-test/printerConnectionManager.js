"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.printerConnectionManager = void 0;
const printerConfig_1 = require("./printerConfig");
const windowsSpooler_1 = require("./drivers/windowsSpooler");
const networkPrinter_1 = require("./drivers/networkPrinter");
class PrinterConnectionManager {
    constructor() {
        this.currentState = "CONNECTING";
        this.currentMessage = "Initializing printer connection...";
        this.lastCheckedTimestamp = 0;
        this.listeners = new Set();
        this.heartbeatTimer = null;
        this.isChecking = false;
        this.failureCount = 0;
        this.startHeartbeat();
    }
    static getInstance() {
        if (!PrinterConnectionManager.instance) {
            PrinterConnectionManager.instance = new PrinterConnectionManager();
        }
        return PrinterConnectionManager.instance;
    }
    getState() {
        return this.currentState;
    }
    getMessage() {
        return this.currentMessage;
    }
    isReadyToPrint() {
        return this.currentState === "READY" || this.currentState === "CONNECTED";
    }
    setState(newState, message) {
        const oldState = this.currentState;
        this.currentState = newState;
        if (message) {
            this.currentMessage = message;
        }
        if (oldState !== newState) {
            this.notifyListeners();
        }
    }
    onStateChange(cb) {
        this.listeners.add(cb);
        return () => this.listeners.delete(cb);
    }
    notifyListeners() {
        this.listeners.forEach((listener) => {
            try {
                listener(this.currentState, this.currentMessage);
            }
            catch (err) {
                console.error("Listener error:", err);
            }
        });
    }
    /**
     * Initializes or verifies printer connection
     */
    async checkConnection(force = false) {
        // If currently printing, do not interfere with spooler
        if (this.currentState === "PRINTING" && !force) {
            return this.buildStatusObject(true, "Printer is actively printing.");
        }
        if (this.isChecking) {
            return this.buildStatusObject(this.isReadyToPrint(), this.currentMessage);
        }
        this.isChecking = true;
        try {
            const config = await (0, printerConfig_1.getPrinterConfig)();
            const now = Date.now();
            this.lastCheckedTimestamp = now;
            if (config.simulationMode || config.connectionType === "virtual") {
                this.failureCount = 0;
                this.setState("READY", "Virtual printer simulator ready.");
                return this.buildStatusObject(true, "Virtual simulation mode ready.");
            }
            if (config.connectionType === "network") {
                const netRes = await (0, networkPrinter_1.checkNetworkPrinter)(config.networkHost, config.networkPort);
                if (netRes.online) {
                    this.failureCount = 0;
                    this.setState("READY", `Network printer ready at ${config.networkHost}:${config.networkPort}`);
                    return this.buildStatusObject(true, netRes.message);
                }
                else {
                    this.failureCount++;
                    const state = this.failureCount >= 2 ? "DISCONNECTED" : "CONNECTING";
                    this.setState(state, netRes.message);
                    return this.buildStatusObject(false, netRes.message);
                }
            }
            // Windows Spooler (USB/Driver)
            const installedPrinters = await (0, windowsSpooler_1.listWindowsPrinters)();
            const isInstalled = installedPrinters.some((p) => p.toLowerCase() === config.printerName.toLowerCase());
            if (!isInstalled) {
                this.failureCount++;
                const msg = `Printer '${config.printerName}' not found in installed printers.`;
                this.setState("DISCONNECTED", msg);
                return this.buildStatusObject(false, msg, installedPrinters);
            }
            const spoolerCheck = await (0, windowsSpooler_1.checkWindowsPrinter)(config.printerName);
            if (spoolerCheck.online) {
                this.failureCount = 0;
                // If we were previously disconnected or connecting, transition to CONNECTED -> READY
                this.setState("READY", `Printer '${config.printerName}' is online and ready.`);
                return this.buildStatusObject(true, spoolerCheck.message, installedPrinters);
            }
            else {
                this.failureCount++;
                const state = this.failureCount >= 2 ? "DISCONNECTED" : "CONNECTING";
                this.setState(state, spoolerCheck.message);
                return this.buildStatusObject(false, spoolerCheck.message, installedPrinters);
            }
        }
        catch (err) {
            this.failureCount++;
            const msg = `Printer connection error: ${err.message}`;
            this.setState("ERROR", msg);
            return this.buildStatusObject(false, msg);
        }
        finally {
            this.isChecking = false;
        }
    }
    buildStatusObject(online, message, installedPrinters) {
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
    startHeartbeat() {
        if (this.heartbeatTimer)
            clearInterval(this.heartbeatTimer);
        // Initial check
        this.checkConnection();
        // Recheck every 3.5 seconds
        this.heartbeatTimer = setInterval(async () => {
            // Do not run background probe if actively printing
            if (this.currentState === "PRINTING")
                return;
            await this.checkConnection();
        }, 3500);
    }
    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }
}
exports.printerConnectionManager = PrinterConnectionManager.getInstance();
