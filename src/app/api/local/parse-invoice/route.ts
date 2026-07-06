import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/auth";
import { localModeUnavailable } from "@/lib/local-mode";
import { resolveBusiness } from "@/lib/local-settings";
import { listContacts } from "@/lib/contacts";
import { hasInvoiceDir } from "@/lib/library";
import { extractInvoiceFields } from "@/lib/invoice-parse";
import { extractPdfText } from "@/lib/pdf-text";

export const runtime = "nodejs";

const MAX_BYTES = 20 * 1024 * 1024;

/**
 * Pre-upload helper: extract the PDF's text and suggest form values, matching
 * the sender against existing contacts by email. Purely advisory — nothing is
 * stored; the user reviews the prefilled form and submits as usual.
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
    return NextResponse.json({ error: "Attach a PDF (max 20MB)" }, { status: 400 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return NextResponse.json({ error: "Not a PDF file" }, { status: 400 });
  }

  let text = "";
  try {
    text = await extractPdfText(buf);
  } catch (err) {
    console.error(
      "pdf text extraction failed:",
      err instanceof Error ? err.stack : err,
    );
  }
  if (!text.trim()) {
    // Scanned/image-only PDF — nothing to suggest, and that's fine.
    return NextResponse.json({ suggestions: {}, matchedContact: null, textFound: false });
  }

  const business = resolveBusiness();
  const suggestions = extractInvoiceFields(text, [business.email]);

  // Recognize the sender: exact email match against the contact book.
  let matchedContact: { email: string; name: string } | null = null;
  if (suggestions.contactEmail && hasInvoiceDir()) {
    try {
      const contacts = await listContacts();
      const hit = contacts.find((c) => c.email === suggestions.contactEmail);
      if (hit) {
        matchedContact = { email: hit.email, name: hit.name };
        if (!suggestions.senderName) suggestions.senderName = hit.name;
      }
    } catch {
      /* contact book unavailable — suggestions still useful */
    }
  }

  return NextResponse.json({ suggestions, matchedContact, textFound: true });
}
