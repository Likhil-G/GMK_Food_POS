"use strict";
/**
 * GMK Food Court - ESC/POS Command Builder
 * High-performance binary generator for thermal receipt printers (XP-S300N / XP-80).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EscposBuilder = void 0;
class EscposBuilder {
    constructor(columns = 48) {
        this.buffer = [];
        this.totalColumns = 48; // Standard 80mm Font A width
        this.totalColumns = columns;
    }
    /**
     * Initializes printer, resets line spacing, and selects character code table
     */
    init(codePage = 16) {
        // ESC @: Initialize printer
        this.buffer.push(0x1b, 0x40);
        // ESC t n: Select character code table (16 = WPC1252 / Latin 1, 0 = PC437)
        this.buffer.push(0x1b, 0x74, codePage);
        // ESC 2: Select default line spacing (1/6 inch)
        this.buffer.push(0x1b, 0x32);
        return this;
    }
    /**
     * Set left margin in printhead dots (GS L nL nH)
     * At 203 DPI (8 dots/mm): 8 dots = 1.0mm
     */
    setLeftMargin(dots) {
        const clamped = Math.max(0, Math.min(576, Math.round(dots)));
        const nL = clamped % 256;
        const nH = Math.floor(clamped / 256);
        this.buffer.push(0x1d, 0x4c, nL, nH);
        return this;
    }
    /**
     * Set printable area width in dots (GS W nL nH)
     */
    setPrintAreaWidth(dots) {
        const clamped = Math.max(100, Math.min(576, Math.round(dots)));
        const nL = clamped % 256;
        const nH = Math.floor(clamped / 256);
        this.buffer.push(0x1d, 0x57, nL, nH);
        return this;
    }
    /**
     * Feed n dots (ESC J n) for sub-line precise vertical padding
     */
    feedDots(dots) {
        if (dots <= 0)
            return this;
        const n = Math.min(255, Math.round(dots));
        this.buffer.push(0x1b, 0x4a, n);
        return this;
    }
    /**
     * Set text alignment (left, center, right)
     */
    align(alignment) {
        const val = alignment === "center" ? 0x01 : alignment === "right" ? 0x02 : 0x00;
        this.buffer.push(0x1b, 0x61, val);
        return this;
    }
    /**
     * Set bold / emphasized text
     */
    bold(enable = true) {
        this.buffer.push(0x1b, 0x45, enable ? 0x01 : 0x00);
        return this;
    }
    /**
     * Set character scaling (widthMultiplier 1-2, heightMultiplier 1-2)
     */
    size(widthMultiplier = 1, heightMultiplier = 1) {
        const w = widthMultiplier === 2 ? 0x10 : 0x00;
        const h = heightMultiplier === 2 ? 0x01 : 0x00;
        this.buffer.push(0x1d, 0x21, w | h);
        return this;
    }
    /**
     * Inverted black/white mode (white text on black background)
     */
    invert(enable = true) {
        this.buffer.push(0x1d, 0x42, enable ? 0x01 : 0x00);
        return this;
    }
    /**
     * Append raw text string with character sanitization
     */
    text(str) {
        const sanitized = this.sanitizeText(str);
        for (let i = 0; i < sanitized.length; i++) {
            const code = sanitized.charCodeAt(i);
            this.buffer.push(code <= 0xff ? code : 0x3f); // Fallback to '?' for unmapped unicode
        }
        return this;
    }
    /**
     * Append text followed by line feed
     */
    line(str = "") {
        if (str.length > 0) {
            this.text(str);
        }
        this.buffer.push(0x0a);
        return this;
    }
    /**
     * Feed n lines
     */
    feed(lines = 1) {
        if (lines <= 0)
            return this;
        if (lines <= 255) {
            // ESC d n
            this.buffer.push(0x1b, 0x64, lines);
        }
        else {
            for (let i = 0; i < lines; i++) {
                this.buffer.push(0x0a);
            }
        }
        return this;
    }
    /**
     * Print a horizontal separator line across all columns
     */
    divider(char = "-") {
        const fillChar = char.charAt(0) || "-";
        const lineStr = fillChar.repeat(this.totalColumns);
        return this.line(lineStr);
    }
    /**
     * Print a 2-column key-value row (e.g. Subtotal on left, Rs. 250 on right)
     */
    twoColumnRow(left, right) {
        const leftSanitized = this.sanitizeText(left);
        const rightSanitized = this.sanitizeText(right);
        const spaceNeeded = this.totalColumns - leftSanitized.length - rightSanitized.length;
        if (spaceNeeded >= 1) {
            const rowStr = leftSanitized + " ".repeat(spaceNeeded) + rightSanitized;
            return this.line(rowStr);
        }
        else {
            // If combined length exceeds total width, print on two lines
            this.line(leftSanitized);
            const rightPad = Math.max(0, this.totalColumns - rightSanitized.length);
            return this.line(" ".repeat(rightPad) + rightSanitized);
        }
    }
    /**
     * Print a structured multi-column table row with automatic word wrapping.
     * Ensures that long item names wrap cleanly to subsequent lines without
     * pushing or misaligning adjacent columns.
     */
    tableRow(columns) {
        // 1. Wrap each column's text into wrapped lines
        const wrappedCols = columns.map((col) => {
            const sanitized = this.sanitizeText(col.text);
            return this.wrapText(sanitized, col.width);
        });
        // 2. Find max line count among columns
        const maxLines = Math.max(...wrappedCols.map((w) => w.length), 1);
        // 3. Render each line
        for (let lineIdx = 0; lineIdx < maxLines; lineIdx++) {
            let lineStr = "";
            for (let colIdx = 0; colIdx < columns.length; colIdx++) {
                const col = columns[colIdx];
                const cellText = wrappedCols[colIdx][lineIdx] || "";
                const formattedCell = this.padCell(cellText, col.width, col.align || "left");
                lineStr += formattedCell;
            }
            this.line(lineStr);
        }
        return this;
    }
    /**
     * Perform paper cut (partial cut or full cut)
     */
    cut(partial = true) {
        if (partial) {
            // GS V 66 0 (Function B: Partial cut leaving one point uncut)
            this.buffer.push(0x1d, 0x56, 0x42, 0x00);
        }
        else {
            // GS V 65 0 (Function B: Full cut)
            this.buffer.push(0x1d, 0x56, 0x41, 0x00);
        }
        return this;
    }
    /**
     * Cash drawer kick-out pulse (RJ11 connector)
     */
    cashDrawer() {
        // ESC p 0 25 250 (Pin 2, 50ms ON, 500ms OFF)
        this.buffer.push(0x1b, 0x70, 0x00, 0x19, 0xfa);
        return this;
    }
    /**
     * Returns complete ESC/POS command sequence as a Uint8Array
     */
    toUint8Array() {
        return new Uint8Array(this.buffer);
    }
    /**
     * Returns complete ESC/POS command sequence as a Node.js Buffer
     */
    toBuffer() {
        return Buffer.from(this.buffer);
    }
    /**
     * Get total byte length
     */
    get length() {
        return this.buffer.length;
    }
    // --- Private Helpers ---
    /**
     * Sanitizes text:
     * 1. Replaces Rupee symbol '₹' with 'Rs.' to prevent CP437/WPC1252 corruption.
     * 2. Replaces unicode dashes, quotes, and non-printable characters with ASCII equivalents.
     */
    sanitizeText(str) {
        if (!str)
            return "";
        return str
            .replace(/₹/g, "Rs.")
            .replace(/[\u2018\u2019]/g, "'") // Single quotes
            .replace(/[\u201C\u201D]/g, '"') // Double quotes
            .replace(/[\u2013\u2014]/g, "-") // En/Em dashes
            .replace(/\u00A0/g, " ") // Non-breaking space
            .replace(/[\r\n\t]/g, " "); // Flatten linebreaks inside cell text
    }
    /**
     * Splits text into array of strings not exceeding maxChars per line
     */
    wrapText(text, maxChars) {
        if (text.length <= maxChars) {
            return [text];
        }
        const words = text.split(" ");
        const lines = [];
        let currentLine = "";
        for (const word of words) {
            if (word.length > maxChars) {
                // Word itself is longer than column width; break it forcefully
                if (currentLine.length > 0) {
                    lines.push(currentLine);
                    currentLine = "";
                }
                let remaining = word;
                while (remaining.length > maxChars) {
                    lines.push(remaining.substring(0, maxChars));
                    remaining = remaining.substring(maxChars);
                }
                currentLine = remaining;
            }
            else if (currentLine.length === 0) {
                currentLine = word;
            }
            else if (currentLine.length + 1 + word.length <= maxChars) {
                currentLine += " " + word;
            }
            else {
                lines.push(currentLine);
                currentLine = word;
            }
        }
        if (currentLine.length > 0) {
            lines.push(currentLine);
        }
        return lines.length > 0 ? lines : [""];
    }
    /**
     * Pads a cell string to exact width according to alignment
     */
    padCell(text, width, align) {
        if (text.length >= width) {
            return text.substring(0, width);
        }
        const padding = width - text.length;
        if (align === "right") {
            return " ".repeat(padding) + text;
        }
        else if (align === "center") {
            const leftPad = Math.floor(padding / 2);
            const rightPad = padding - leftPad;
            return " ".repeat(leftPad) + text + " ".repeat(rightPad);
        }
        else {
            // left
            return text + " ".repeat(padding);
        }
    }
}
exports.EscposBuilder = EscposBuilder;
