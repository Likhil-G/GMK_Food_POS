import { NextRequest, NextResponse } from "next/server";
import { getPrinterConfig, savePrinterConfig } from "@/printing/printerConfig";
import { PrinterConfig } from "@/printing/printTypes";

export async function GET() {
  try {
    const config = await getPrinterConfig();
    return NextResponse.json(config);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to load config" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const updates = (await req.json()) as Partial<PrinterConfig>;
    const updated = await savePrinterConfig(updates);
    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to save config" },
      { status: 500 }
    );
  }
}

