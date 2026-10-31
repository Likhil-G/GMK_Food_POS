"use strict";
/**
 * GMK Food Court - Network ESC/POS Driver
 * Connects directly via TCP socket to port 9100 on XP-S300N Ethernet/LAN interface.
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
exports.checkNetworkPrinter = checkNetworkPrinter;
exports.printToNetworkPrinter = printToNetworkPrinter;
const net = __importStar(require("net"));
/**
 * Check if network printer is reachable
 */
async function checkNetworkPrinter(host, port = 9100, timeoutMs = 2500) {
    if (!host) {
        return { online: false, message: "Network host IP not configured" };
    }
    return new Promise((resolve) => {
        const socket = new net.Socket();
        let settled = false;
        const finalize = (online, message) => {
            if (settled)
                return;
            settled = true;
            socket.destroy();
            resolve({ online, message });
        };
        socket.setTimeout(timeoutMs);
        socket.on("connect", () => {
            finalize(true, `Network printer at ${host}:${port} is reachable.`);
        });
        socket.on("timeout", () => {
            finalize(false, `Connection to ${host}:${port} timed out after ${timeoutMs}ms.`);
        });
        socket.on("error", (err) => {
            finalize(false, `Cannot reach ${host}:${port} - ${err.message}`);
        });
        try {
            socket.connect(port, host);
        }
        catch (err) {
            finalize(false, `Socket connection error: ${err.message}`);
        }
    });
}
/**
 * Send raw binary ESC/POS buffer directly to network printer over TCP
 */
async function printToNetworkPrinter(host, port = 9100, buffer, timeoutMs = 8000) {
    if (!host) {
        return {
            success: false,
            bytesWritten: 0,
            message: "Printer IP address is required",
            error: "IP_REQUIRED",
        };
    }
    return new Promise((resolve) => {
        const socket = new net.Socket();
        let settled = false;
        const finalize = (success, bytesWritten, message, error) => {
            if (settled)
                return;
            settled = true;
            socket.destroy();
            resolve({ success, bytesWritten, message, error });
        };
        socket.setTimeout(timeoutMs);
        socket.on("connect", () => {
            socket.write(buffer, (err) => {
                if (err) {
                    finalize(false, 0, `Failed to write bytes to socket: ${err.message}`, err.message);
                }
                else {
                    // Allow socket to flush before ending
                    socket.end(() => {
                        finalize(true, buffer.length, `Sent ${buffer.length} bytes to ${host}:${port}`);
                    });
                }
            });
        });
        socket.on("timeout", () => {
            finalize(false, 0, `Network timeout connecting to ${host}:${port}`, "SOCKET_TIMEOUT");
        });
        socket.on("error", (err) => {
            finalize(false, 0, `Network printer error: ${err.message}`, err.message);
        });
        try {
            socket.connect(port, host);
        }
        catch (err) {
            finalize(false, 0, `Connection attempt failed: ${err.message}`, err.message);
        }
    });
}
