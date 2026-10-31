"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { CartProvider, useCart } from "./context/CartContext";
import { menuItems, categories } from "./data/menu";
import Bill from "../components/Bill";
import PrinterConfigModal from "../components/PrinterConfigModal";
import { printerClient, PrintButtonState, ExtendedPrinterClientStatus } from "../printing/printerClient";
import { BillPayload } from "../printing/printTypes";
import { ConnectionState } from "../printing/printerConnectionManager";
import styles from "./page.module.css";

function VegIndicator({ veg }: { veg: boolean }) {
  return veg ? (
    <span className={styles.vegDot} title="Vegetarian" />
  ) : (
    <span className={styles.nonVegDot} title="Non-vegetarian" />
  );
}

function POSApp() {
  const {
    cart,
    addItem,
    removeItem,
    updateQty,
    clearCart,
    total,
    itemCount,
    tableNo,
    setTableNo,
    customerName,
    setCustomerName,
  } = useCart();

  const [activeCategory, setActiveCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [showBillModal, setShowBillModal] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  // Printer Connection & Queue State
  const [printerStatus, setPrinterStatus] = useState<ExtendedPrinterClientStatus | null>(null);
  const [printState, setPrintState] = useState<PrintButtonState>("READY");
  const [printMessage, setPrintMessage] = useState<string | null>(null);
  const [lastPrintedBill, setLastPrintedBill] = useState<{ billNo: string; payload: BillPayload } | null>(null);
  const [currentBillNo, setCurrentBillNo] = useState<string>("");

  const billRef = useRef<HTMLDivElement>(null);

  const cats = activeCategory === "All" ? categories : [activeCategory];
  const getQty = (id: string) => cart.find((c) => c.id === id)?.qty ?? 0;

  const gst = Math.round(total * 0.05);
  const grandTotal = total + gst;

  // Generate or maintain stable bill number while cart is active
  useEffect(() => {
    if (cart.length > 0 && !currentBillNo) {
      setCurrentBillNo(`GMK-${Date.now().toString().slice(-6)}`);
    } else if (cart.length === 0 && currentBillNo) {
      setCurrentBillNo("");
      setPrintState("READY");
      setPrintMessage(null);
    }
  }, [cart.length, currentBillNo]);

  // Periodic printer status poll (every 3.5s) to reflect live hardware & queue state
  useEffect(() => {
    let mounted = true;
    const fetchStatus = () => {
      printerClient.checkStatus().then((status) => {
        if (mounted) {
          setPrinterStatus(status);
        }
      });
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 3500);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  /**
   * DIRECT ESC/POS THERMAL PRINT HANDLER
   * Sends structured JSON payload to local sequential queue for direct hardware output.
   * Completely bypasses window.print() and browser/OS print dialogs.
   * Supports continuous, unlimited consecutive printing (Bill 1, Bill 2, Bill 3...).
   */
  const handleDirectPrint = async (isReprint: boolean = false) => {
    if (cart.length === 0 && !isReprint) {
      setPrintState("ERROR");
      setPrintMessage("Cart is empty. Add items before printing.");
      return;
    }

    // If reprint, use previous bill payload; otherwise build fresh payload
    let payload: BillPayload;
    const now = new Date();

    if (isReprint && lastPrintedBill) {
      payload = {
        ...lastPrintedBill.payload,
        jobId: printerClient.generateJobId(`${lastPrintedBill.billNo}_REPRINT`),
        isReprint: true,
        timestamp: Date.now(),
      };
    } else {
      const billNoToUse = currentBillNo || `GMK-${Date.now().toString().slice(-6)}`;
      payload = {
        jobId: printerClient.generateJobId(billNoToUse),
        timestamp: Date.now(),
        isReprint: false,
        restaurant: {
          name: "GMK Food Court",
          tagline: "Pure Taste · Pure Quality",
          address: "123 Food Street, Hyderabad — 500001",
          phone: "+91 98765 43210",
          gstin: "36AABCU9603R1ZM",
        },
        bill: {
          billNo: billNoToUse,
          date: now.toLocaleDateString("en-IN"),
          time: now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
          tableNo: tableNo ? tableNo.trim() : undefined,
          customerName: customerName ? customerName.trim() : undefined,
        },
        items: cart.map((c) => ({
          id: c.id,
          name: c.name,
          qty: c.qty,
          price: c.price,
          amount: c.price * c.qty,
        })),
        totals: {
          subtotal: total,
          gstRate: 0.05,
          gstAmount: gst,
          grandTotal,
        },
        footer: {
          message1: "Thank you for dining with us!",
          message2: "Visit again",
        },
      };
    }

    const res = await printerClient.printDirect(payload, (resp) => {
      setPrintState(resp.state);
      setPrintMessage(resp.message);
    });

    if (res.success) {
      // Save last printed bill for intentional reprint capability
      setLastPrintedBill({ billNo: payload.bill.billNo, payload });

      // Generate next fresh bill number for subsequent customer
      setCurrentBillNo(`GMK-${Date.now().toString().slice(-6)}`);

      // Auto-restore state to READY after 2.5s
      setTimeout(() => {
        setPrintState("READY");
      }, 2500);
    }
  };

  const handleClearCart = () => {
    clearCart();
    setCurrentBillNo("");
    setPrintState("READY");
    setPrintMessage(null);
  };

  // Determine current connection state string
  const activeConnectionState: ConnectionState =
    printState === "PRINTING"
      ? "PRINTING"
      : printerStatus?.connectionState || (printerStatus?.online ? "READY" : "DISCONNECTED");

  // Status Badge Label for Topbar
  const getStatusBadgeLabel = () => {
    switch (activeConnectionState) {
      case "CONNECTING":
        return "CONNECTING...";
      case "CONNECTED":
        return "CONNECTED";
      case "READY":
        return printerStatus?.printerName ? `READY (${printerStatus.printerName})` : "READY";
      case "PRINTING":
        return "PRINTING...";
      case "DISCONNECTED":
        return "DISCONNECTED";
      case "ERROR":
        return "ERROR";
      default:
        return "READY";
    }
  };

  // Status Badge Dot Class
  const getStatusDotClass = () => {
    switch (activeConnectionState) {
      case "READY":
      case "CONNECTED":
        return styles.statusIndicator;
      case "PRINTING":
        return `${styles.statusIndicator} ${styles.statusIndicatorPrinting || ""}`;
      case "CONNECTING":
        return `${styles.statusIndicator} ${styles.statusIndicatorConnecting || ""}`;
      case "DISCONNECTED":
      case "ERROR":
      default:
        return `${styles.statusIndicator} ${styles.statusIndicatorOffline}`;
    }
  };

  // Primary Print Button Label
  const getPrintButtonLabel = () => {
    switch (printState) {
      case "PRINTING":
        return "⏳ Printing to XP-S300N...";
      case "SUCCESS":
        return "✓ Print Successful";
      case "DUPLICATE":
        return "⚠ Already Printed";
      case "DISCONNECTED":
        return "✕ Printer Disconnected";
      case "ERROR":
        return "✕ Print Error";
      default:
        return "🖨 Print bill";
    }
  };

  // Primary Print Button Styling Class
  const getPrintButtonClass = () => {
    switch (printState) {
      case "PRINTING":
        return `${styles.btnPrimary} ${styles.btnPrinting}`;
      case "SUCCESS":
        return `${styles.btnPrimary} ${styles.btnSuccess}`;
      case "DUPLICATE":
        return `${styles.btnPrimary} ${styles.btnDuplicate}`;
      case "DISCONNECTED":
      case "ERROR":
        return `${styles.btnPrimary} ${styles.btnError}`;
      default:
        return styles.btnPrimary;
    }
  };

  return (
    <div className={styles.app}>
      {/* ── TOP BAR ── */}
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <div className={styles.logoMark}>GMK</div>
          <div>
            <h1 className={styles.brandName}>GMK Food Court</h1>
            <p className={styles.brandSub}>Point of Sale</p>
          </div>
        </div>

        <div className={styles.headerInputs}>
          <input
            className={styles.tableInput}
            placeholder="Table no."
            value={tableNo}
            onChange={(e) => setTableNo(e.target.value)}
          />
          <input
            className={styles.tableInput}
            placeholder="Customer name"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
          />

          {/* Persistent Connection Status Badge: CONNECTING | CONNECTED | READY | PRINTING | DISCONNECTED | ERROR */}
          <button
            type="button"
            className={styles.printerBadge}
            onClick={() => setIsConfigOpen(true)}
            title="Printer Connection Manager (Click to Configure)"
          >
            <span className={getStatusDotClass()} />
            <span>{getStatusBadgeLabel()}</span>
            <span style={{ fontSize: "11px", opacity: 0.8 }}>⚙</span>
          </button>
        </div>
      </header>

      {/* ── CATEGORY NAV ── */}
      <nav className={styles.catNav}>
        <button
          className={`${styles.catBtn} ${activeCategory === "All" ? styles.catBtnActive : ""}`}
          onClick={() => setActiveCategory("All")}
        >
          All items
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            className={`${styles.catBtn} ${activeCategory === cat ? styles.catBtnActive : ""}`}
            onClick={() => setActiveCategory(cat)}
          >
            {cat}
          </button>
        ))}
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}>🔍</span>
          <input
            className={styles.searchInput}
            placeholder="Search items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </nav>

      <div className={styles.layout}>
        {/* ── MENU PANE ── */}
        <div className={styles.menuPane}>
          {cats.map((cat) => {
            const items = menuItems.filter(
              (i) =>
                i.category === cat &&
                (search === "" || i.name.toLowerCase().includes(search.toLowerCase()))
            );
            if (!items.length) return null;
            return (
              <div key={cat}>
                <div className={styles.sectionHeader}>{cat}</div>
                {items.map((item) => {
                  const qty = getQty(item.id);
                  return (
                    <div
                      key={item.id}
                      className={`${styles.menuRow} ${qty > 0 ? styles.menuRowActive : ""}`}
                    >
                      <div className={styles.itemMeta}>
                        <p className={styles.itemName}>{item.name}</p>
                        <div className={styles.itemIndicator}>
                          <VegIndicator veg={item.veg} />
                        </div>
                      </div>
                      <div className={styles.itemPrice}>₹{item.price}</div>
                      <div className={styles.itemCtrl}>
                        {qty === 0 ? (
                          <button className={styles.addBtn} onClick={() => addItem(item)}>
                            + Add
                          </button>
                        ) : (
                          <div className={styles.qtyRow}>
                            <button
                              className={styles.qtyBtn}
                              onClick={() => updateQty(item.id, qty - 1)}
                            >
                              −
                            </button>
                            <span className={styles.qtyNum}>{qty}</span>
                            <button className={styles.qtyBtn} onClick={() => addItem(item)}>
                              +
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {cats.every((cat) =>
            !menuItems.some(
              (i) =>
                i.category === cat &&
                i.name.toLowerCase().includes(search.toLowerCase())
            )
          ) && (
            <div className={styles.emptySearch}>No items match your search.</div>
          )}
        </div>

        {/* ── CART PANE ── */}
        <div className={styles.cartPane}>
          <div className={styles.cartHead}>
            <h2 className={styles.cartTitle}>
              Current order
              {itemCount > 0 && (
                <span className={styles.cartBadge}>{itemCount}</span>
              )}
            </h2>
            {cart.length > 0 && (
              <button className={styles.clearBtn} onClick={handleClearCart}>
                Clear
              </button>
            )}
          </div>

          {(tableNo || customerName) && (
            <div className={styles.orderMeta}>
              {tableNo && <span>Table: <strong>{tableNo}</strong></span>}
              {customerName && <span>Customer: <strong>{customerName}</strong></span>}
            </div>
          )}

          <div className={styles.cartItems}>
            {cart.length === 0 ? (
              <div className={styles.emptyCart}>
                <p>🍴</p>
                <p>No items added yet.<br />Select from the menu.</p>
              </div>
            ) : (
              cart.map((item) => (
                <div key={item.id} className={styles.cartItem}>
                  <div>
                    <p className={styles.ciName}>{item.name}</p>
                    <p className={styles.ciRate}>₹{item.price} × {item.qty}</p>
                  </div>
                  <div className={styles.ciRight}>
                    <p className={styles.ciTotal}>₹{item.price * item.qty}</p>
                    <div className={styles.ciCtrl}>
                      <button
                        className={styles.ciBtn}
                        onClick={() => updateQty(item.id, item.qty - 1)}
                      >
                        −
                      </button>
                      <span className={styles.ciQty}>{item.qty}</span>
                      <button className={styles.ciBtn} onClick={() => addItem(item)}>
                        +
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {cart.length > 0 && (
            <div className={styles.billSection}>
              <div className={styles.billRow}>
                <span>Subtotal ({itemCount} items)</span>
                <span>₹{total}</span>
              </div>
              <div className={styles.billRow}>
                <span>GST (5%)</span>
                <span>₹{gst}</span>
              </div>
              <hr className={styles.billDivider} />
              <div className={styles.billTotal}>
                <span>Total</span>
                <span>₹{grandTotal}</span>
              </div>

              {/* Action Buttons: Supports continuous consecutive prints */}
              <div className={styles.cartActions}>
                <button
                  className={styles.btnOutline}
                  onClick={() => setShowBillModal(true)}
                  type="button"
                >
                  👁 Preview
                </button>

                <button
                  className={getPrintButtonClass()}
                  onClick={() => handleDirectPrint(false)}
                  disabled={printState === "PRINTING"}
                  type="button"
                >
                  {getPrintButtonLabel()}
                </button>

                {lastPrintedBill && (
                  <button
                    className={styles.btnReprint}
                    onClick={() => handleDirectPrint(true)}
                    disabled={printState === "PRINTING"}
                    type="button"
                    title={`Reprint copy of Bill ${lastPrintedBill.billNo}`}
                  >
                    ⚡ Reprint ({lastPrintedBill.billNo})
                  </button>
                )}
              </div>

              {/* Status feedback message */}
              {printMessage && (
                <div
                  className={`${styles.printToast} ${
                    printState === "SUCCESS"
                      ? styles.printToastSuccess
                      : printState === "DUPLICATE"
                      ? styles.printToastWarning
                      : styles.printToastError
                  }`}
                >
                  {printMessage}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── BILL PREVIEW MODAL (Preserves on-screen styling intact) ── */}
      {showBillModal && (
        <div className={styles.modalOverlay} onClick={() => setShowBillModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Bill preview</h3>
              <button
                className={styles.modalClose}
                onClick={() => setShowBillModal(false)}
              >
                ✕
              </button>
            </div>
            <div className={styles.modalBody}>
              <Bill
                printRef={billRef}
                billNo={currentBillNo}
                isReprint={false}
              />
            </div>
            <div className={styles.modalFooter}>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  className={getPrintButtonClass()}
                  onClick={() => handleDirectPrint(false)}
                  disabled={printState === "PRINTING"}
                  type="button"
                >
                  {getPrintButtonLabel()}
                </button>

                {lastPrintedBill && (
                  <button
                    className={styles.btnReprint}
                    onClick={() => handleDirectPrint(true)}
                    disabled={printState === "PRINTING"}
                    type="button"
                  >
                    ⚡ Reprint
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── PRINTER CONFIGURATION MODAL ── */}
      <PrinterConfigModal
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        onStatusUpdated={(s) => setPrinterStatus(s as any)}
      />
    </div>
  );
}

export default function Page() {
  return (
    <CartProvider>
      <POSApp />
    </CartProvider>
  );
}
