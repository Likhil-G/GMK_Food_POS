import { NextRequest, NextResponse } from "next/server";
import { printBill } from "@/printing/printerService";
import { BillPayload } from "@/printing/printTypes";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as BillPayload;
    const result = await printBill(body);

    if (result.duplicate) {
      return NextResponse.json(result, { status: 409 }); // 409 Conflict for duplicate print
    }

    if (!result.success) {
      return NextResponse.json(result, { status: 502 }); // Bad Gateway / Hardware failure
    }

    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        message: err.message || "Failed to process print request",
        error: err.message,
      },
      { status: 500 }
    );
  }
}

