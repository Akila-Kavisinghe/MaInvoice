import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/auth";
import { localModeUnavailable } from "@/lib/local-mode";
import { addInvoice, hasInvoiceDir } from "@/lib/library";
import { upsertContact } from "@/lib/contacts";
import { resolveBusiness } from "@/lib/local-settings";
import { renderOutboundInvoicePdf } from "@/lib/pdf";
import { generateInvoiceNumber } from "@/lib/invoice-number";
import { invoiceFilename } from "@/lib/format";
import { outboundSchema } from "@/lib/validation";

export const runtime = "nodejs";

/** Generate an outbound invoice (the user requesting money from a client). */
export async function POST(req: Request) {
  const gate = localModeUnavailable();
  if (gate) return gate;
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  }
  if (!hasInvoiceDir()) {
    return NextResponse.json({ error: "Choose an invoice folder first" }, { status: 400 });
  }

  const parsed = outboundSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const business = resolveBusiness();
  if (!business.name || !business.email) {
    return NextResponse.json(
      { error: "Set your business name and email first (Your business details in settings)" },
      { status: 400 },
    );
  }

  const { saveContact, ...pdfInput } = input;
  const invoiceNumber = generateInvoiceNumber();
  const pdf = await renderOutboundInvoicePdf({
    invoiceNumber,
    business,
    ...pdfInput,
  });

  const today = new Date().toISOString().slice(0, 10);
  const filename = invoiceFilename(
    business.name,
    input.eventName ?? input.clientName,
    input.eventDate ?? today,
  );

  const entry = await addInvoice(pdf, filename, "generated", "outbound", {
    eventName: input.eventName ?? undefined,
    // The line item doubles as the entry's secondary descriptor (the line
    // under the event in the table), capped to the field's length.
    description: input.description.slice(0, 200),
    eventDate: input.eventDate ?? today,
    invoiceNumber,
    amount: input.amount,
    notes: input.notes,
    contactEmail: input.clientEmail,
    contactName: input.clientName,
  });

  // Only saved when the user opted in on the form.
  if (saveContact && input.clientEmail) {
    try {
      await upsertContact({
        email: input.clientEmail,
        name: input.clientName,
        address: input.clientAddress,
      });
    } catch (err) {
      console.error("contact upsert failed", err);
    }
  }

  // Prefilled email the user can send to the client (PDF attached manually —
  // same browser limitation as the bandmate flow).
  const email = input.clientEmail
    ? {
        to: input.clientEmail,
        subject: `Invoice ${invoiceNumber} - ${business.name}${input.eventName ? ` - ${input.eventName}` : ""}`,
        body:
          `Hi ${input.clientName},\n\n` +
          `Please find attached invoice ${invoiceNumber}` +
          (input.eventName ? ` for ${input.eventName}` : "") +
          `.\n\nThank you,\n${business.name}`,
      }
    : null;

  return NextResponse.json({ entry, email });
}
