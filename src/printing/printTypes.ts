/**
 * GMK Food Court - Thermal Printing System Types
 * Defines data structures for Bill payload, ESC/POS configuration, and printer management.
 */

export interface BillItem {
  id: string;
  name: string;
  qty: number;
  price: number;
  amount: number;
}

export interface BillTotals {
  subtotal: number;
  gstRate: number; // e.g. 0.05 for 5%
  gstAmount: number;
  grandTotal: number;
}

export interface RestaurantInfo {
  name: string;
  tagline?: string;
  address: string;
  phone: string;
  gstin: string;
}

export interface BillMetadata {
  billNo: string;
  date: string;
  time: string;
  tableNo?: string;
  customerName?: string;
}

export interface BillPayload {
  jobId: string;
  timestamp: number;
  isReprint?: boolean;
  restaurant: RestaurantInfo;
  bill: BillMetadata;
  items: BillItem[];
  totals: BillTotals;
  footer?: {
    message1?: string;
    message2?: string;
  };
}

export type ConnectionType = "windows-spooler" | "network" | "virtual";

export interface PrinterConfig {
  connectionType: ConnectionType;
  printerName: string; // Windows printer name, e.g. "Xprinter XP-80" or "XP-S300N"
  networkHost: string; // IP address for LAN printing, e.g. "192.168.1.100"
  networkPort: number; // Raw print port, default 9100
  paperWidthMm: number; // Default 80mm
  columns: number; // Standard 80mm is 48 columns (Font A)
  autoCut: boolean; // Cut paper after printing
  cutType: "partial" | "full"; // Partial cut (preferred) or full cut
  openCashDrawer: boolean; // Trigger RJ11 drawer pulse if attached
  currencySymbol: "Rs." | "INR" | "₹"; // Default "Rs." for 100% ESC/POS code page compatibility
  feedLinesBeforeCut: number; // Minimum lines to advance to cutter head (typically 3)
  simulationMode: boolean; // Force virtual printer simulation for offline testing
}

export interface PrinterStatus {
  online: boolean;
  ready: boolean;
  connectionType: ConnectionType;
  printerName: string;
  message: string;
  details?: {
    installedPrinters?: string[];
    errorCode?: number;
    resolvedTarget?: string;
  };
  timestamp: number;
}

export interface PrintJobResult {
  success: boolean;
  jobId: string;
  printerName: string;
  connectionType: ConnectionType;
  bytesWritten?: number;
  durationMs?: number;
  duplicate?: boolean;
  message: string;
  simulatedReceiptText?: string;
  error?: string;
}

