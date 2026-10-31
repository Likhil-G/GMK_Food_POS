"use client";
import React, { useEffect, useState } from "react";
import { printerClient } from "../printing/printerClient";
import { PrinterConfig, PrinterStatus } from "../printing/printTypes";
import styles from "./PrinterConfigModal.module.css";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onStatusUpdated?: (status: PrinterStatus) => void;
}

export default function PrinterConfigModal({ isOpen, onClose, onStatusUpdated }: Props) {
  const [config, setConfig] = useState<PrinterConfig | null>(null);
  const [installedPrinters, setInstalledPrinters] = useState<string[]>([]);
  const [status, setStatus] = useState<PrinterStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const loadData = async () => {
      setLoading(true);
      setMessage(null);
      setTestResult(null);

      try {
        const [loadedConfig, printers, currentStatus] = await Promise.all([
          printerClient.getConfig(),
          printerClient.listPrinters(),
          printerClient.checkStatus(),
        ]);

        if (loadedConfig) setConfig(loadedConfig);
        setInstalledPrinters(printers);
        setStatus(currentStatus);
        onStatusUpdated?.(currentStatus);
      } catch (err: any) {
        setMessage(`Failed to load printer settings: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [isOpen]);

  const handleRefreshStatus = async () => {
    setLoading(true);
    try {
      const s = await printerClient.checkStatus();
      setStatus(s);
      onStatusUpdated?.(s);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;

    setLoading(true);
    setMessage(null);

    try {
      const saved = await printerClient.saveConfig(config);
      if (saved) {
        setConfig(saved);
        const s = await printerClient.checkStatus();
        setStatus(s);
        onStatusUpdated?.(s);
        setMessage("Configuration saved successfully!");
        setTimeout(() => {
          onClose();
        }, 800);
      }
    } catch (err: any) {
      setMessage(`Error saving configuration: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleTestPrint = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await printerClient.testPrint();
      if (res.success) {
        setTestResult(`Test receipt printed successfully! (${res.durationMs || 0}ms)`);
      } else {
        setTestResult(`Test print failed: ${res.message || res.error}`);
      }
    } catch (err: any) {
      setTestResult(`Test print error: ${err.message}`);
    } finally {
      setTesting(false);
    }
  };

  if (!isOpen || !config) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.titleWrap}>
            <span className={styles.icon}>🖨</span>
            <div>
              <h3>XP-S300N Thermal Printer Setup</h3>
              <p className={styles.sub}>Direct ESC/POS 80mm Printing Settings</p>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Status banner */}
        <div className={`${styles.statusBanner} ${status?.online ? styles.bannerOnline : styles.bannerOffline}`}>
          <div className={styles.statusDot} />
          <div className={styles.statusInfo}>
            <strong>{status?.online ? "Printer Ready" : "Printer Offline / Disconnected"}</strong>
            <span>{status?.message || "Checking..."}</span>
          </div>
          <button
            type="button"
            className={styles.refreshBtn}
            onClick={handleRefreshStatus}
            disabled={loading}
          >
            ↻ Refresh
          </button>
        </div>

        <form onSubmit={handleSave} className={styles.form}>
          <div className={styles.section}>
            <label className={styles.label}>Connection Method</label>
            <div className={styles.radioGroup}>
              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  name="connectionType"
                  value="windows-spooler"
                  checked={config.connectionType === "windows-spooler"}
                  onChange={() => setConfig({ ...config, connectionType: "windows-spooler" })}
                />
                <span>Windows Spooler (USB / Driver)</span>
              </label>

              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  name="connectionType"
                  value="network"
                  checked={config.connectionType === "network"}
                  onChange={() => setConfig({ ...config, connectionType: "network" })}
                />
                <span>Network / LAN (TCP 9100)</span>
              </label>

              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  name="connectionType"
                  value="virtual"
                  checked={config.connectionType === "virtual" || config.simulationMode}
                  onChange={() => setConfig({ ...config, connectionType: "virtual", simulationMode: true })}
                />
                <span>Virtual / Simulator (Test Mode)</span>
              </label>
            </div>
          </div>

          {config.connectionType === "windows-spooler" && (
            <div className={styles.section}>
              <label className={styles.label} htmlFor="printerSelect">
                Target Thermal Printer
              </label>
              <select
                id="printerSelect"
                className={styles.select}
                value={config.printerName}
                onChange={(e) => setConfig({ ...config, printerName: e.target.value })}
              >
                {installedPrinters.length > 0 ? (
                  installedPrinters.map((p) => (
                    <option key={p} value={p}>
                      {p} {/xprinter|xp-s300|xp-80|pos-80/i.test(p) ? "★ (Recommended POS)" : ""}
                    </option>
                  ))
                ) : (
                  <option value={config.printerName}>{config.printerName}</option>
                )}
              </select>
              <span className={styles.hint}>
                Windows Spooler sends raw binary ESC/POS directly to the driver port (e.g. USB002).
              </span>
            </div>
          )}

          {config.connectionType === "network" && (
            <div className={styles.grid2}>
              <div>
                <label className={styles.label} htmlFor="netHost">
                  Printer IP Address
                </label>
                <input
                  id="netHost"
                  type="text"
                  className={styles.input}
                  value={config.networkHost}
                  placeholder="192.168.1.100"
                  onChange={(e) => setConfig({ ...config, networkHost: e.target.value })}
                />
              </div>
              <div>
                <label className={styles.label} htmlFor="netPort">
                  Port (Default: 9100)
                </label>
                <input
                  id="netPort"
                  type="number"
                  className={styles.input}
                  value={config.networkPort}
                  onChange={(e) => setConfig({ ...config, networkPort: parseInt(e.target.value) || 9100 })}
                />
              </div>
            </div>
          )}

          <div className={styles.grid2}>
            <div>
              <label className={styles.label}>Paper Roll Width</label>
              <select
                className={styles.select}
                value={config.paperWidthMm}
                onChange={(e) => {
                  const mm = parseInt(e.target.value) || 80;
                  setConfig({ ...config, paperWidthMm: mm, columns: mm === 58 ? 32 : 48 });
                }}
              >
                <option value={80}>80mm (XP-S300N standard / 48 columns)</option>
                <option value={58}>58mm (32 columns)</option>
              </select>
            </div>

            <div>
              <label className={styles.label}>Currency Symbol on Receipt</label>
              <select
                className={styles.select}
                value={config.currencySymbol}
                onChange={(e) => setConfig({ ...config, currencySymbol: e.target.value as any })}
              >
                <option value="Rs.">Rs. (Universal Safe POS Standard)</option>
                <option value="INR">INR (ISO code)</option>
                <option value="₹">₹ (Direct symbol)</option>
              </select>
            </div>
          </div>

          <div className={styles.grid2}>
            <div>
              <label className={styles.label}>Cutter Action</label>
              <div className={styles.toggleRow}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={config.autoCut}
                    onChange={(e) => setConfig({ ...config, autoCut: e.target.checked })}
                  />
                  <span>Auto Cut Receipt</span>
                </label>

                {config.autoCut && (
                  <select
                    className={styles.selectSmall}
                    value={config.cutType}
                    onChange={(e) => setConfig({ ...config, cutType: e.target.value as any })}
                  >
                    <option value="partial">Partial Cut (Recommended)</option>
                    <option value="full">Full Cut</option>
                  </select>
                )}
              </div>
            </div>

            <div>
              <label className={styles.label}>Feed Lines Before Cut</label>
              <input
                type="number"
                min={1}
                max={10}
                className={styles.input}
                value={config.feedLinesBeforeCut}
                onChange={(e) => setConfig({ ...config, feedLinesBeforeCut: parseInt(e.target.value) || 3 })}
              />
              <span className={styles.hint}>Lines to advance past printhead (3 is optimal)</span>
            </div>
          </div>

          {/* Feedback messages */}
          {message && <div className={styles.alertSuccess}>{message}</div>}
          {testResult && (
            <div className={testResult.includes("success") ? styles.alertSuccess : styles.alertError}>
              {testResult}
            </div>
          )}

          {/* Actions */}
          <div className={styles.footer}>
            <button
              type="button"
              className={styles.btnTest}
              onClick={handleTestPrint}
              disabled={testing || loading}
            >
              {testing ? "Printing Test..." : "⚡ Test Print Receipt"}
            </button>

            <div className={styles.footerRight}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={styles.btnPrimary}
                disabled={loading}
              >
                {loading ? "Saving..." : "Save Settings"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

