import { NextResponse } from "next/server";
import { hasValidSession } from "@/lib/auth";
import { addSubmission, getGig } from "@/lib/store";
import { bandmateSchema } from "@/lib/validation";
import { renderInvoicePdf } from "@/lib/pdf";
import { invoiceFilename } from "@/lib/format";
import { generateInvoiceNumber } from "@/lib/invoice-number";
import type { BandmateInput } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: { token: string } },
) {
  // Gate: only authenticated bandmates can generate.
  if (!hasValidSession("band")) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const gig = await getGig(params.token);
  if (!gig) {
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
  await addSubmission(params.token, {
    bandmateName: input.bandmateName,
    bandmateEmail: input.bandmateEmail,
    invoiceNumber: input.invoiceNumber,
    amount: input.amount,
    submittedAt: new Date().toISOString(),
  });
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
