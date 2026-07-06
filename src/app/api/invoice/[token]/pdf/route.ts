import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { hasValidSession, sameOrigin } from "@/lib/auth";
import { config } from "@/lib/config";
import { addPendingInvoice, addSubmission, getGig } from "@/lib/store";
import { bandmateSchema } from "@/lib/validation";
import { renderInvoicePdf } from "@/lib/pdf";
import { invoiceFilename } from "@/lib/format";
import { generateInvoiceNumber } from "@/lib/invoice-number";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import type { BandmateInput } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  }

  // Gate: only authenticated bandmates can generate.
  if (!(await hasValidSession("band"))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  // PDF rendering is comparatively expensive — keep one client from
  // hammering it.
  const limit = await rateLimit(`pdf:${clientIp(req.headers)}`, 30, 5 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Too many requests. Try again in ${limit.retryAfterSeconds}s.` },
      { status: 429 },
    );
  }

  const { token } = await params;
  const gig = await getGig(token);
  // Archived (revoked) links are dead for bandmates until restored.
  if (!gig || gig.archivedAt) {
    return NextResponse.json({ error: "Invoice link not found" }, { status: 404 });
  }

  const parsed = bandmateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  // If the admin locked the amount, the server is the source of truth.
  const amount =
    gig.amountLocked && typeof gig.defaultAmount === "number"
      ? gig.defaultAmount
      : parsed.data.amount;

  // Unique invoice number, generated server-side. If this bandmate already
  // submitted for this gig, reuse their existing number so a re-send keeps the
  // same invoice identity (just with updated content). Otherwise mint a new one
  // that doesn't collide with any already used for this gig.
  const emailKey = parsed.data.bandmateEmail.trim().toLowerCase();
  const existing = (gig.submissions ?? []).find(
    (s) => s.bandmateEmail.trim().toLowerCase() === emailKey,
  );
  let invoiceNumber: string;
  if (existing) {
    invoiceNumber = existing.invoiceNumber;
  } else {
    const used = new Set((gig.submissions ?? []).map((s) => s.invoiceNumber));
    do {
      invoiceNumber = generateInvoiceNumber();
    } while (used.has(invoiceNumber));
  }

  const input: BandmateInput = { ...parsed.data, amount, invoiceNumber };

  const pdf = await renderInvoicePdf(gig, input);
  const filename = invoiceFilename(input.bandmateName, gig.eventName, gig.eventDate);

  // Record a MINIMAL submission for admin tracking (who invoiced, for how much,
  // when). Address / tax # / payment method / notes are deliberately NOT stored
  // — they exist only in the generated PDF.
  try {
    await addSubmission(token, {
      bandmateName: input.bandmateName,
      bandmateEmail: input.bandmateEmail,
      invoiceNumber: input.invoiceNumber,
      amount: input.amount,
      submittedAt: new Date().toISOString(),
    });
  } catch (err) {
    // Tracking is secondary to delivering the invoice — hand the PDF back
    // even if the store write failed.
    console.error("addSubmission failed for gig", token, err);
  }

  // Retain the PDF server-side so the owner's local library app can pull it
  // into their invoice folder (deleted once the local app acks the download,
  // or after 90 days). Best-effort — never blocks delivery to the bandmate.
  try {
    // Base64 inflates ~33%; keep well under Upstash's 1MB request cap. These
    // text-only PDFs are typically tens of KB. If the template ever embeds
    // images, revisit with blob storage.
    if (pdf.byteLength <= 700 * 1024) {
      await addPendingInvoice({
        id: crypto.randomUUID(),
        ownerEmail: gig.ownerEmail ?? config.superAdminEmail,
        gigToken: token,
        eventName: gig.eventName,
        eventDate: gig.eventDate,
        bandmateName: input.bandmateName,
        bandmateEmail: input.bandmateEmail,
        invoiceNumber,
        amount: input.amount,
        filename,
        createdAt: new Date().toISOString(),
        pdfBase64: Buffer.from(pdf).toString("base64"),
      });
    } else {
      console.error("PDF too large to retain for sync", token, pdf.byteLength);
    }
  } catch (err) {
    console.error("addPendingInvoice failed for gig", token, err);
  }

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
      "X-Invoice-Number": invoiceNumber,
    },
  });
}
