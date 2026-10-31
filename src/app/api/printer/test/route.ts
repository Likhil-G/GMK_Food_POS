import { NextResponse } from "next/server";
import { printTestReceipt } from "@/printing/printerService";

export async function POST() {
  try {
    const result = await printTestReceipt();
    if (!result.success) {
      return NextResponse.json(result, { status: 502 });
    }
    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        message: err.message || "Test print failed",
        error: err.message,
      },
      { status: 500 }
    );
  }
}

