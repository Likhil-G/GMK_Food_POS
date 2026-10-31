# GMK Food Court — POS System (Redesigned)

A Next.js 14 Point of Sale & Billing System for GMK Food Court.

## What's new in this version

- **Restructured layout**: Top navigation bar with category tabs + sticky section headers in the menu pane, replacing the original card grid
- **No food emoji icons**: Replaced with standard Indian food industry veg/non-veg indicators (green dot = veg, red triangle = non-veg)
- **Light theme**: Clean paper-white and cream tones instead of dark mode
- **List-style menu**: Dense row-based layout lets the cashier see more items without scrolling
- **Minimal order panel**: Receipt-like right panel with clean bill breakdown

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Tech stack

- Next.js 14 (App Router)
- React 18
- TypeScript
- CSS Modules

## Project structure

```
src/
├── app/
│   ├── context/CartContext.tsx   # Cart state
│   ├── data/menu.ts              # Menu items (with veg flag)
│   ├── globals.css               # Global CSS variables & reset
│   ├── layout.tsx
│   ├── page.tsx                  # Main POS layout
│   └── page.module.css           # Component styles
└── components/
    ├── Bill.tsx                  # Printable receipt
    └── Bill.module.css
```

## Thermal receipt printing (XP-S300N / 80 mm)

The bill is rendered once, inside the existing preview modal. Both preview and
printing use that same DOM node; there is no hidden duplicate receipt. Before
opening the browser print dialog, the app waits for fonts/layout, measures the
rendered receipt element, converts its actual pixel height to millimetres, and
injects a one-print `@page` rule (`80mm` wide by the measured height). The rule
is removed after the print dialog closes. No item-count or fixed receipt-height
calculation is used.

### Windows / Chrome setup

- Install the XP-S300N manufacturer's Windows driver and select the actual
  80 mm roll / continuous-paper form (not A4 or Letter).
- Set printable width / left-right margins for the printer's real printable
  area. The app lays out receipt content at 72 mm within an 80 mm page.
- Disable browser print headers and footers; use 100% scale and no additional
  browser margins. Avoid “Fit to page” if it changes the receipt width.
- If the driver offers a paper-length or continuous-roll setting, enable it.
  Some Windows thermal drivers ignore custom CSS page lengths or round them to
  their configured form. In that case, driver configuration—not React/CSS—
  controls the physical trailing feed.

### Hardware boundary

This project currently uses Chromium `window.print()` and contains no ESC/POS,
QZ Tray, Electron, USB, or LAN transport. The app now requests a measured custom
page size, but software inspection cannot establish whether a particular
XP-S300N driver/firmware honours that size or its cutter capability. Verify with
the actual printer. If the driver ignores per-job page length, the reliable next
step is a local print bridge (for example QZ Tray or an Electron service) that
sends raster/text plus ESC/POS feed-and-cut commands; choosing that transport
requires confirming whether this printer is connected by USB, serial, or LAN.
