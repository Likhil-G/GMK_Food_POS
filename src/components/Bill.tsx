"use client";
import React, { useMemo } from "react";
import { useCart } from "../app/context/CartContext";
import styles from "./Bill.module.css";

interface BillProps {
  printRef?: React.Ref<HTMLDivElement>;
  billNo?: string;
  dateStr?: string;
  timeStr?: string;
  isReprint?: boolean;
}

export default function Bill({ printRef, billNo: propBillNo, dateStr, timeStr, isReprint }: BillProps) {
  const { cart, total, tableNo, customerName } = useCart();

  const gst = Math.round(total * 0.05);
  const grandTotal = total + gst;

  // Stable bill number and timestamp
  const defaultBillNo = useMemo(() => `GMK-${Date.now().toString().slice(-6)}`, []);
  const billNo = propBillNo || defaultBillNo;

  const now = useMemo(() => new Date(), []);
  const displayDate = dateStr || now.toLocaleDateString("en-IN");
  const displayTime = timeStr || now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  return (
    <div id="bill-printable" ref={printRef} className={styles.bill}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.logoText}>GMK</div>
        <h1 className={styles.restaurantName}>GMK Food Court</h1>
        <p className={styles.tagline}>Pure Taste · Pure Quality</p>
        <p className={styles.address}>123 Food Street, Hyderabad — 500001</p>
        <p className={styles.address}>+91 98765 43210 | GSTIN: 36AABCU9603R1ZM</p>
      </div>

      <div className={styles.divider}>{"—".repeat(32)}</div>

      {isReprint && (
        <>
          <div style={{ textAlign: "center", fontWeight: "bold", fontSize: "11px", margin: "2px 0" }}>
            *** DUPLICATE / REPRINT ***
          </div>
          <div className={styles.divider}>{"—".repeat(32)}</div>
        </>
      )}

      {/* Bill Info */}
      <div className={styles.infoGrid}>
        <div><span className={styles.label}>Bill No:</span>{billNo}</div>
        <div><span className={styles.label}>Date:</span>{displayDate}</div>
        <div><span className={styles.label}>Time:</span>{displayTime}</div>
        <div><span className={styles.label}>Table:</span>{tableNo || "—"}</div>
        {customerName && <div><span className={styles.label}>Customer:</span>{customerName}</div>}
      </div>

      <div className={styles.divider}>{"—".repeat(32)}</div>

      {/* Items */}
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.thItem}>Item</th>
            <th className={styles.thQty}>Qty</th>
            <th className={styles.thPrice}>Rate</th>
            <th className={styles.thTotal}>Amt</th>
          </tr>
        </thead>
        <tbody>
          {cart.map((item) => (
            <tr key={item.id}>
              <td className={styles.tdItem}>{item.name}</td>
              <td className={styles.tdQty}>{item.qty}</td>
              <td className={styles.tdPrice}>₹{item.price}</td>
              <td className={styles.tdTotal}>₹{item.price * item.qty}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className={styles.divider}>{"—".repeat(32)}</div>

      {/* Totals */}
      <div className={styles.totals}>
        <div className={styles.totalRow}>
          <span>Subtotal</span>
          <span>₹{total}</span>
        </div>
        <div className={styles.totalRow}>
          <span>GST (5%)</span>
          <span>₹{gst}</span>
        </div>
        <div className={styles.divider}>{"—".repeat(32)}</div>
        <div className={styles.grandRow}>
          <span>TOTAL</span>
          <span>₹{grandTotal}</span>
        </div>
      </div>

      <div className={styles.divider}>{"—".repeat(32)}</div>

      {/* Footer */}
      <div className={styles.footer}>
        <p>Thank you for dining with us!</p>
        <p>Visit again</p>
      </div>
    </div>
  );
}
