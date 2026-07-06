import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/auth";
import { localModeUnavailable } from "@/lib/local-mode";
import { addInvoice, hasInvoiceDir, listInvoices, scanUnindexed } from "@/lib/library";
import { upsertContact } from "@/lib/contacts";
import { libraryMetaSchema } from "@/lib/validation";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export async function GET() {
  const gate = localModeUnavailable();
  if (gate) return gate;
  if (!hasInvoiceDir()) {
    return NextResponse.json({ invoices: [], unindexed: [], needsSetup: true });
  }

  const [invoices, unindexed] = await Promise.all([listInvoices(), scanUnindexed()]);
  return NextResponse.json({ invoices, unindexed });
}

/** Manual upload: multipart form with a `file` PDF plus optional metadata. */
export async function POST(req: Request) {
  const gate = localModeUnavailable();
  if (gate) return gate;
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  }
  if (!hasInvoiceDir()) {
    return NextResponse.json({ error: "Choose an invoice folder first" }, { status: 400 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File)) {
    return NextResponse.json({ error: "Attach a PDF file" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File too large (max 20MB)" }, { status: 400 });
  }

  const parsed = libraryMetaSchema.safeParse({
    eventName: form.get("eventName") ?? "",
    eventDate: form.get("eventDate") ?? "",
    bandmateName: form.get("bandmateName") ?? "",
    contactEmail: form.get("contactEmail") ?? "",
    invoiceNumber: form.get("invoiceNumber") ?? "",
    amount: form.get("amount") ?? "",
    notes: form.get("notes") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const pdf = Buffer.from(await file.arrayBuffer());
  if (pdf.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return NextResponse.json({ error: "Not a PDF file" }, { status: 400 });
  }

  const meta = {
    ...parsed.data,
    contactName: parsed.data.bandmateName,
  };
  const entry = await addInvoice(pdf, file.name || "invoice.pdf", "upload", "inbound", meta);

  // Create/refresh a contact card for the sender — only when the user opted
  // in on the form (checkbox defaults to on when an email is present).
  let contactSaved = false;
  const wantContact = form.get("saveContact") !== "false";
  if (wantContact && meta.contactEmail) {
    try {
      await upsertContact({ email: meta.contactEmail, name: meta.bandmateName });
      contactSaved = true;
    } catch (err) {
      console.error("contact upsert failed", err);
    }
  }
  return NextResponse.json({ entry, contactSaved });
}
