"use strict";
/**
 * GMK Food Court - Virtual / Simulated Printer Driver
 * Captures raw ESC/POS commands, decodes text structure, and logs receipts for simulation & automated testing.
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
exports.decodeEscposToText = decodeEscposToText;
exports.printToVirtualPrinter = printToVirtualPrinter;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Decodes an ESC/POS binary buffer into a human-readable text receipt
 */
function decodeEscposToText(buffer) {
    let output = "";
    let i = 0;
    while (i < buffer.length) {
        const b = buffer[i];
        // ESC @ (Init)
        if (b === 0x1b && buffer[i + 1] === 0x40) {
            i += 2;
            continue;
        }
        // ESC t n (Select code page)
        if (b === 0x1b && buffer[i + 1] === 0x74) {
            i += 3;
            continue;
        }
        // ESC 2 or ESC 3 n (Line spacing)
        if (b === 0x1b && buffer[i + 1] === 0x32) {
            i += 2;
            continue;
        }
        if (b === 0x1b && buffer[i + 1] === 0x33) {
            i += 3;
            continue;
        }
        // ESC a n (Alignment)
        if (b === 0x1b && buffer[i + 1] === 0x61) {
            i += 3;
            continue;
        }
        // ESC E n (Emphasized / bold)
        if (b === 0x1b && buffer[i + 1] === 0x45) {
            i += 3;
            continue;
        }
        // ESC - n (Underline)
        if (b === 0x1b && buffer[i + 1] === 0x2d) {
            i += 3;
            continue;
        }
        // ESC ! n (Select print mode)
        if (b === 0x1b && buffer[i + 1] === 0x21) {
            i += 3;
            continue;
        }
        // GS ! n (Select character size)
        if (b === 0x1d && buffer[i + 1] === 0x21) {
            i += 3;
            continue;
        }
        // ESC J n (Feed n dots)
        if (b === 0x1b && buffer[i + 1] === 0x4a) {
            i += 3;
            continue;
        }
        // GS L nL nH (Set left margin)
        if (b === 0x1d && buffer[i + 1] === 0x4c) {
            i += 4;
            continue;
        }
        // GS W nL nH (Set print area width)
        if (b === 0x1d && buffer[i + 1] === 0x57) {
            i += 4;
            continue;
        }
        // ESC d n (Feed n lines)
        if (b === 0x1b && buffer[i + 1] === 0x64) {
            const lines = buffer[i + 2] || 1;
            output += "\n".repeat(lines);
            i += 3;
            continue;
        }
        // GS V m n (Paper Cut)
        if (b === 0x1d && buffer[i + 1] === 0x56) {
            output += "\n[=== PAPER CUT ===]\n";
            // Function B takes 4 bytes, Function A takes 3 bytes
            if (buffer[i + 2] === 0x41 || buffer[i + 2] === 0x42) {
                i += 4;
            }
            else {
                i += 3;
            }
            continue;
        }
        // ESC p m t1 t2 (Cash drawer)
        if (b === 0x1b && buffer[i + 1] === 0x70) {
            output += "[KICK CASH DRAWER]\n";
            i += 5;
            continue;
        }
        // Standard printable or newline characters
        if (b === 0x0a) {
            output += "\n";
        }
        else if (b >= 0x20 && b <= 0x7e) {
            output += String.fromCharCode(b);
        }
        else if (b > 0x7e) {
            output += String.fromCharCode(b);
        }
        i++;
    }
    return output.trim();
}
/**
 * Simulates printing to thermal printer: saves receipt text to logs and returns decoded text
 */
async function printToVirtualPrinter(buffer, docName = "GMK Receipt") {
    const decodedText = decodeEscposToText(buffer);
    const logDir = path.resolve(process.cwd(), "logs", "virtual-prints");
    let savedFilePath;
    try {
        if (!fs.existsSync(logDir)) {
            await fs.promises.mkdir(logDir, { recursive: true });
        }
        const filename = `receipt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.txt`;
        savedFilePath = path.join(logDir, filename);
        await fs.promises.writeFile(savedFilePath, decodedText, "utf8");
    }
    catch {
        // Non-fatal if filesystem logging is restricted
    }
    return {
        success: true,
        bytesWritten: buffer.length,
        message: `[VIRTUAL PRINTER] Simulated ${buffer.length} bytes for ${docName}`,
        simulatedReceiptText: decodedText,
        savedFilePath,
    };
}
