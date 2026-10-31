import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GMK Food Court — POS",
  description: "Point of Sale & Billing System",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
