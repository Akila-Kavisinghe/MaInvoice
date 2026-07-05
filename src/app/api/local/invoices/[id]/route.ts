import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/auth";
import { localModeUnavailable } from "@/lib/local-mode";
import {
  deleteInvoice,
  getInvoiceFile,
  hasInvoiceDir,
  updateInvoice,
} from "@/lib/library";
import { invoicePatchSchema } from "@/lib/validation";

export const runtime = "nodejs";

/** Stream an invoice for in-browser preview. */
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
  const found = await getInvoiceFile(id);
  if (!found) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const filename = found.entry.relPath.split("/").pop() ?? "invoice.pdf";
  return new NextResponse(new Uint8Array(found.pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}

/** Toggle row flags: emailReceived (inbound) and paid. */
export async function PATCH(
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

  const parsed = invoicePatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { id } = await params;
  const entry = await updateInvoice(id, parsed.data);
  if (!entry) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ entry });
}

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
  const removed = await deleteInvoice(id);
  if (!removed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
