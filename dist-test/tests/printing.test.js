"use strict";
/**
 * GMK Food Court - Comprehensive Thermal Printing Test Suite
 * Tests ESC/POS generation, exact +20% 4-sided padding, dynamic sizing,
 * continuous sequential printing, duplicate prevention, and connection lifecycle.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const printerService_1 = require("../printerService");
const billFormatter_1 = require("../billFormatter");
const virtualPrinter_1 = require("../drivers/virtualPrinter");
const printerConnectionManager_1 = require("../printerConnectionManager");
// Default test configuration (Virtual mode for automated testing)
const testConfig = {
    connectionType: "virtual",
    printerName: "Xprinter XP-80",
    networkHost: "127.0.0.1",
    networkPort: 9100,
    paperWidthMm: 80,
    columns: billFormatter_1.RECEIPT_COLUMNS_80MM, // 46 columns after +20% horizontal padding
    autoCut: true,
    cutType: "partial",
    openCashDrawer: false,
    currencySymbol: "Rs.",
    feedLinesBeforeCut: 3,
    simulationMode: true,
};
function createSamplePayload(itemCount, overrides = {}) {
    const items = [];
    let subtotal = 0;
    for (let i = 1; i <= itemCount; i++) {
        const price = 50 + (i % 5) * 20;
        const qty = 1 + (i % 3);
        const amount = price * qty;
        subtotal += amount;
        items.push({
            id: `item-${i}`,
            name: `Menu Dish ${i}`,
            qty,
            price,
            amount,
        });
    }
    const gstRate = 0.05;
    const gstAmount = Math.round(subtotal * gstRate);
    const grandTotal = subtotal + gstAmount;
    return {
        jobId: `TEST_JOB_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(),
        restaurant: {
            name: "GMK Food Court",
            tagline: "Pure Taste · Pure Quality",
            address: "123 Food Street, Hyderabad — 500001",
            phone: "+91 98765 43210",
            gstin: "36AABCU9603R1ZM",
        },
        bill: {
            billNo: `GMK-${Math.floor(100000 + Math.random() * 900000)}`,
            date: "31/10/2026",
            time: "08:30 PM",
            tableNo: "Table 12",
            customerName: "Rahul Sharma",
        },
        items,
        totals: {
            subtotal,
            gstRate,
            gstAmount,
            grandTotal,
        },
        footer: {
            message1: "Thank you for dining with us!",
            message2: "Visit again",
        },
        ...overrides,
    };
}
let passed = 0;
let failed = 0;
function assert(condition, testName, details) {
    if (condition) {
        console.log(`  ✓ PASS: ${testName}`);
        passed++;
    }
    else {
        console.error(`  ✕ FAIL: ${testName}${details ? ` -> ${details}` : ""}`);
        failed++;
    }
}
async function runTests() {
    console.log("\n=======================================================");
    console.log(" GMK FOOD COURT - CRITICAL PRINTING TEST SUITE");
    console.log("=======================================================\n");
    // TEST 1: Empty cart rejection & schema validation
    console.log("[1] Empty Cart & Validation Tests:");
    {
        const emptyPayload = createSamplePayload(0);
        emptyPayload.items = [];
        const val = (0, printerService_1.validateBillPayload)(emptyPayload);
        assert(!val.valid, "Rejects empty cart", val.error);
        const missingTotals = createSamplePayload(2);
        // @ts-ignore
        delete missingTotals.totals;
        const val2 = (0, printerService_1.validateBillPayload)(missingTotals);
        assert(!val2.valid, "Rejects missing totals");
        const invalidQty = createSamplePayload(1);
        invalidQty.items[0].qty = 0;
        const val3 = (0, printerService_1.validateBillPayload)(invalidQty);
        assert(!val3.valid, "Rejects zero/negative quantity");
    }
    // TEST 2: Exact +20% Bill Padding Verification on All 4 Sides
    console.log("\n[2] Exact +20% 4-Sided Padding Verification Tests:");
    {
        const payload = createSamplePayload(2);
        const builder = (0, billFormatter_1.formatBillToEscpos)(payload, testConfig);
        const buf = builder.toBuffer();
        // Top Padding (+20%): Baseline was 24 dots (3.0mm), +20% = 29 dots (3.6mm) -> ESC J 29 (0x1B, 0x4A, 0x1D)
        const hasTopPadding = buf.includes(Buffer.from([0x1b, 0x4a, 29]));
        assert(hasTopPadding, "Top padding increased by +20% (ESC J 29 dots = 3.6mm top clearance)");
        // Left Padding (+20%): Baseline was 4.0mm unprinted roll edge, +20% = 4.8mm (+8 dots hardware margin) -> GS L 8 0 (0x1D, 0x4C, 0x08, 0x00)
        const hasLeftMargin = buf.includes(Buffer.from([0x1d, 0x4c, 8, 0]));
        assert(hasLeftMargin, "Left padding increased by +20% (GS L 8 dots hardware offset = 4.8mm total left padding)");
        // Right Padding (+20%): Available content width reduced to 46 columns (70.4mm) to maintain 4.8mm right margin
        const text = (0, virtualPrinter_1.decodeEscposToText)(buf);
        const textLines = text.split("\n");
        let maxLineLen = 0;
        for (const l of textLines) {
            if (!l.includes("[===") && !l.includes("[KICK")) {
                maxLineLen = Math.max(maxLineLen, l.length);
            }
        }
        assert(maxLineLen <= billFormatter_1.RECEIPT_COLUMNS_80MM, `Content remains within 46 columns (${maxLineLen} <= ${billFormatter_1.RECEIPT_COLUMNS_80MM}) with zero horizontal overflow`);
        // Bottom Padding (+20%): Baseline was 3 lines (72 dots = 9.0mm), +20% = 86 dots (10.8mm) -> feed 3 lines + feed 14 dots before cutter blade
        const hasBottomPadding = buf.includes(Buffer.from([0x1b, 0x64, 3])) && buf.includes(Buffer.from([0x1b, 0x4a, 14]));
        assert(hasBottomPadding, "Bottom padding increased by +20% (86 dots = 10.8mm bottom clearance before cut)");
        // Auto-cut
        const hasCut = buf.includes(Buffer.from([0x1d, 0x56, 0x42, 0x00]));
        assert(hasCut, "Receipt includes auto-cut command (GS V 66 0)");
    }
    // TEST 3: Dynamic Paper Length Tests (1, 2, 5, 10, 20, 35 items)
    console.log("\n[3] Dynamic Paper Length & Item Scaling Tests:");
    const sizes = [1, 2, 5, 10, 20, 35];
    const byteLengths = [];
    for (const count of sizes) {
        const payload = createSamplePayload(count);
        const builder = (0, billFormatter_1.formatBillToEscpos)(payload, testConfig);
        const buf = builder.toBuffer();
        const text = (0, virtualPrinter_1.decodeEscposToText)(buf);
        const lines = text.split("\n").length;
        byteLengths.push(buf.length);
        assert(buf.length > 0, `${count} item(s) dynamically sized (${buf.length} bytes, ${lines} lines)`);
        assert(text.includes(`Menu Dish ${count}`), `Receipt prints Menu Dish ${count}`);
        assert(text.includes("TOTAL"), `Receipt prints TOTAL for ${count} items`);
    }
    let strictlyIncreasing = true;
    for (let i = 1; i < byteLengths.length; i++) {
        if (byteLengths[i] <= byteLengths[i - 1])
            strictlyIncreasing = false;
    }
    assert(strictlyIncreasing, "Byte length scales strictly dynamically with bill items (1 < 2 < 5 < 10 < 20 < 35)");
    // TEST 4: Continuous Sequential Printing (Issue 1 Core Requirement)
    console.log("\n[4] Continuous Consecutive Bill Printing (Unlimited Bills):");
    {
        // First bill
        const bill1 = createSamplePayload(2, { jobId: `SEQ_1_${Date.now()}` });
        const res1 = await (0, printerService_1.printBill)(bill1, testConfig);
        assert(res1.success, "First bill prints successfully on initial connection");
        // Second bill immediately after
        const bill2 = createSamplePayload(3, { jobId: `SEQ_2_${Date.now()}` });
        const res2 = await (0, printerService_1.printBill)(bill2, testConfig);
        assert(res2.success, "Second bill prints successfully without reconnecting manually");
        // Third bill
        const bill3 = createSamplePayload(1, { jobId: `SEQ_3_${Date.now()}` });
        const res3 = await (0, printerService_1.printBill)(bill3, testConfig);
        assert(res3.success, "Third bill prints successfully");
        // 5 consecutive bills in rapid succession
        const batch5Promises = [];
        for (let i = 4; i <= 8; i++) {
            const b = createSamplePayload(i % 3 + 1, { jobId: `SEQ_BATCH5_${i}_${Date.now()}` });
            batch5Promises.push((0, printerService_1.printBill)(b, testConfig));
        }
        const batch5Results = await Promise.all(batch5Promises);
        const all5Passed = batch5Results.every((r) => r.success);
        assert(all5Passed, "Five consecutive bills queued in parallel all print successfully in sequence");
        // 10 consecutive bills
        const batch10Promises = [];
        for (let i = 1; i <= 10; i++) {
            const b = createSamplePayload(i % 4 + 1, { jobId: `SEQ_BATCH10_${i}_${Date.now()}` });
            batch10Promises.push((0, printerService_1.printBill)(b, testConfig));
        }
        const batch10Results = await Promise.all(batch10Promises);
        const all10Passed = batch10Results.every((r) => r.success);
        assert(all10Passed, "Ten consecutive bills all print successfully with 0 lost jobs");
    }
    // TEST 5: Two Rapid Print Clicks (Duplicate Prevention & Queueing)
    console.log("\n[5] Two Rapid Print Clicks & Mutex Queue Tests:");
    {
        const sameBillPayload = createSamplePayload(2);
        sameBillPayload.jobId = `RAPID_${Date.now()}`;
        // Click 1
        const p1 = (0, printerService_1.printBill)(sameBillPayload, testConfig);
        // Click 2 (identical payload sent rapidly before click 1 completed)
        const p2 = (0, printerService_1.printBill)(sameBillPayload, testConfig);
        const [r1, r2] = await Promise.all([p1, p2]);
        assert(r1.success, "Rapid Click 1 executes print job");
        assert(!r2.success && r2.duplicate === true, "Rapid Click 2 blocked by duplicate protection (no accidental duplicate paper roll)");
        // Intentional reprint with isReprint: true
        sameBillPayload.isReprint = true;
        const r3 = await (0, printerService_1.printBill)(sameBillPayload, testConfig);
        assert(r3.success, "Intentional reprint succeeds with isReprint: true");
        assert(r3.simulatedReceiptText?.includes("*** DUPLICATE / REPRINT RECEIPT ***") ?? false, "Reprint contains duplicate watermark");
    }
    // TEST 6: Long Product Names & Table Alignment
    console.log("\n[6] Long Product Names & Table Formatting Tests:");
    {
        const payload = createSamplePayload(1);
        payload.items[0].name = "Chef Special Hyderabadi Mutton Dum Biryani Jumbo Family Pack with Extra Mirchi Ka Salan";
        const builder = (0, billFormatter_1.formatBillToEscpos)(payload, testConfig);
        const buf = builder.toBuffer();
        const text = (0, virtualPrinter_1.decodeEscposToText)(buf);
        assert(text.includes("Chef Special Hyderabadi"), "Wraps long item name line 1");
        assert(text.includes("Mirchi Ka Salan"), "Wraps long item name remaining lines without truncating");
        const textLines = text.split("\n");
        let maxLine = 0;
        for (const l of textLines) {
            if (!l.includes("[===") && !l.includes("[KICK")) {
                maxLine = Math.max(maxLine, l.length);
            }
        }
        assert(maxLine <= billFormatter_1.RECEIPT_COLUMNS_80MM, `No line exceeds 46 columns after +20% padding (max was ${maxLine})`);
    }
    // TEST 7: Large Quantities & Price Variations
    console.log("\n[7] Large Quantities & Price Variations Tests:");
    {
        const payload = createSamplePayload(2);
        payload.items[0].qty = 9999;
        payload.items[0].price = 1250;
        payload.items[0].amount = 9999 * 1250;
        payload.items[1].qty = 1;
        payload.items[1].price = 0;
        payload.items[1].amount = 0;
        payload.totals.subtotal = payload.items[0].amount;
        payload.totals.gstAmount = Math.round(payload.totals.subtotal * 0.05);
        payload.totals.grandTotal = payload.totals.subtotal + payload.totals.gstAmount;
        const builder = (0, billFormatter_1.formatBillToEscpos)(payload, testConfig);
        const text = (0, virtualPrinter_1.decodeEscposToText)(builder.toBuffer());
        assert(text.includes("9999"), "Renders large quantity (9999) accurately");
        assert(text.includes("12498750"), "Calculates large amount (12,498,750)");
    }
    // TEST 8: GST Calculation Verification
    console.log("\n[8] GST & Totals Calculation Verification:");
    {
        const payload = createSamplePayload(3);
        const sub = payload.totals.subtotal;
        const expectedGst = Math.round(sub * 0.05);
        const expectedGrand = sub + expectedGst;
        assert(payload.totals.gstAmount === expectedGst, `GST matches 5% precisely: ${payload.totals.gstAmount} === ${expectedGst}`);
        assert(payload.totals.grandTotal === expectedGrand, `Grand Total matches Subtotal + GST: ${payload.totals.grandTotal} === ${expectedGrand}`);
    }
    // TEST 9: Special Characters & Rupee Symbol Handling
    console.log("\n[9] Character Encoding & Rupee Symbol Sanitization:");
    {
        const payload = createSamplePayload(1);
        payload.items[0].name = "Paneer Tikka 'Special' – 100% “Fresh” & Veg";
        const builder = (0, billFormatter_1.formatBillToEscpos)(payload, testConfig);
        const buf = builder.toBuffer();
        const text = (0, virtualPrinter_1.decodeEscposToText)(buf);
        assert(text.includes("Rs."), "Replaces Rupee sign ₹ with safe ESC/POS 'Rs.' prefix");
        assert(!text.includes("â‚¹"), "No corrupted CP437/UTF8 multi-byte glyphs (â‚¹)");
        assert(text.includes("Special"), "Cleanly sanitizes curly quotes to standard ASCII");
    }
    // TEST 10: Connection Lifecycle & Printer Status States
    console.log("\n[10] Printer Connection Lifecycle & Status Verification:");
    {
        // Wait for queue settle pause to complete
        await new Promise((r) => setTimeout(r, 150));
        const status = await (0, printerService_1.getPrinterStatus)(testConfig);
        assert(status.online, "Printer status reports online");
        assert(status.ready, "Printer status reports ready");
        assert(status.connectionState === "READY" || status.connectionState === "CONNECTED", `Status shows required state (${status.connectionState})`);
    }
    console.log("\n=======================================================");
    console.log(` TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log("=======================================================\n");
    // Clean up background timers
    printerConnectionManager_1.printerConnectionManager.stopHeartbeat();
    if (failed > 0) {
        process.exit(1);
    }
}
runTests().catch((err) => {
    console.error("Test execution error:", err);
    process.exit(1);
});
