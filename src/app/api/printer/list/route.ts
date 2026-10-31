import { NextResponse } from "next/server";
import { listWindowsPrinters } from "@/printing/drivers/windowsSpooler";

export async function GET() {
  try {
    const printers = await listWindowsPrinters();
    return NextResponse.json({ success: true, printers });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, printers: [], error: err.message },
      { status: 500 }
    );
  }
}

