/**
 * GMK Food Court - Network ESC/POS Driver
 * Connects directly via TCP socket to port 9100 on XP-S300N Ethernet/LAN interface.
 */

import * as net from "net";

/**
 * Check if network printer is reachable
 */
export async function checkNetworkPrinter(
  host: string,
  port: number = 9100,
  timeoutMs: number = 2500
): Promise<{ online: boolean; message: string }> {
  if (!host) {
    return { online: false, message: "Network host IP not configured" };
  }

  return new Promise<{ online: boolean; message: string }>((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finalize = (online: boolean, message: string) => {
      if (settled) return;
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

    socket.on("error", (err: any) => {
      finalize(false, `Cannot reach ${host}:${port} - ${err.message}`);
    });

    try {
      socket.connect(port, host);
    } catch (err: any) {
      finalize(false, `Socket connection error: ${err.message}`);
    }
  });
}

/**
 * Send raw binary ESC/POS buffer directly to network printer over TCP
 */
export async function printToNetworkPrinter(
  host: string,
  port: number = 9100,
  buffer: Buffer,
  timeoutMs: number = 8000
): Promise<{ success: boolean; bytesWritten: number; message: string; error?: string }> {
  if (!host) {
    return {
      success: false,
      bytesWritten: 0,
      message: "Printer IP address is required",
      error: "IP_REQUIRED",
    };
  }

  return new Promise<{ success: boolean; bytesWritten: number; message: string; error?: string }>((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finalize = (success: boolean, bytesWritten: number, message: string, error?: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ success, bytesWritten, message, error });
    };

    socket.setTimeout(timeoutMs);

    socket.on("connect", () => {
      socket.write(buffer, (err) => {
        if (err) {
          finalize(false, 0, `Failed to write bytes to socket: ${err.message}`, err.message);
        } else {
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
    } catch (err: any) {
      finalize(false, 0, `Connection attempt failed: ${err.message}`, err.message);
    }
  });
}

