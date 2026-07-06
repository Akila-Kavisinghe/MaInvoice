import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/auth";
import { localModeUnavailable } from "@/lib/local-mode";
import {
  attachReceipt,
  getReceiptFile,
  hasInvoiceDir,
  removeReceipt,
} from "@/lib/library";

export const runtime = "nodejs";

const MAX_RECEIPT_BYTES = 20 * 1024 * 1024;

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".txt": "text/plain",
  ".csv": "text/csv",
};

/** Attach a payment receipt (any file type) — marks the invoice paid. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = localModeUnavailable();
  if (gate) return gate;
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  }
  if (!hasInvoiceDir()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File)) {
    return NextResponse.json({ error: "Attach a file" }, { status: 400 });
  }
  if (file.size > MAX_RECEIPT_BYTES) {
    return NextResponse.json({ error: "File too large (max 20MB)" }, { status: 400 });
  }

  // Optional payment date (yyyy-mm-dd) — for receipts filed later than the
  // money actually moved.
  const paidDateRaw = form.get("paidDate");
  const paidDate =
    typeof paidDateRaw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(paidDateRaw)
      ? paidDateRaw
      : undefined;
  if (typeof paidDateRaw === "string" && paidDateRaw !== "" && !paidDate) {
    return NextResponse.json({ error: "Use a valid paid date" }, { status: 400 });
  }

  const { id } = await params;
  const entry = await attachReceipt(
    id,
    Buffer.from(await file.arrayBuffer()),
    file.name || "receipt",
    paidDate,
  );
  if (!entry) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ entry });
}

/** Stream the receipt for in-browser preview. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = localModeUnavailable();
  if (gate) return gate;
  if (!hasInvoiceDir()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { id } = await params;
  const found = await getReceiptFile(id);
  if (!found) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const filename = found.entry.receiptPath!.split("/").pop() ?? "receipt";
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  return new NextResponse(new Uint8Array(found.file), {
    status: 200,
    headers: {
      "Content-Type": MIME_BY_EXT[ext] ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${filename.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}

/** Detach and delete the receipt file (keeps the paid flag). */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = localModeUnavailable();
  if (gate) return gate;
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  }
  if (!hasInvoiceDir()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { id } = await params;
  const entry = await removeReceipt(id);
  if (!entry) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ entry });
}
