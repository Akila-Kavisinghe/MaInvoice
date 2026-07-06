import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/auth";
import { localModeUnavailable } from "@/lib/local-mode";
import { extractPdfText } from "@/lib/pdf-text";
import { extractReceiptDate } from "@/lib/receipt-parse";

export const runtime = "nodejs";

const MAX_BYTES = 20 * 1024 * 1024;

/**
 * Pre-attach helper: read a payment receipt PDF and detect the payment date
 * (e.g. TD's "Date Sent May 13, 2026"), so the "Paid on" field can prefill.
 * Advisory only — nothing is stored, and non-PDF receipts return null.
 */
export async function POST(req: Request) {
  const gate = localModeUnavailable();
  if (gate) return gate;
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File) || file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Attach a file (max 20MB)" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") {
    // Images/scans: nothing to read, and that's fine.
    return NextResponse.json({ paidDate: null, textFound: false });
  }

  let text = "";
  try {
    text = await extractPdfText(buf);
  } catch (err) {
    console.error("receipt text extraction failed:", err instanceof Error ? err.stack : err);
  }
  if (!text.trim()) {
    return NextResponse.json({ paidDate: null, textFound: false });
  }

  return NextResponse.json({ paidDate: extractReceiptDate(text), textFound: true });
}
