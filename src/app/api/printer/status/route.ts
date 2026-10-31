import { NextResponse } from "next/server";
import { getPrinterStatus } from "@/printing/printerService";

export async function GET() {
  try {
    const status = await getPrinterStatus();
    return NextResponse.json(status);
  } catch (err: any) {
    return NextResponse.json(
      {
        online: false,
        ready: false,
        message: err.message || "Failed to check printer status",
        timestamp: Date.now(),
      },
      { status: 500 }
    );
  }
}

