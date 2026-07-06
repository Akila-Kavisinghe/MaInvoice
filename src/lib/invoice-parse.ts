/**
 * Heuristic extraction of invoice fields from PDF text, used to prefill the
 * upload form. Everything returned is a SUGGESTION the user can edit — wrong
 * guesses cost one keystroke, so the rules favour "probably right" over
 * "provably right". Only works on PDFs with a text layer (scans yield nothing).
 */

export interface InvoiceSuggestions {
  contactEmail?: string;
  senderName?: string;
  invoiceNumber?: string;
  amount?: number;
  eventName?: string;
  eventDate?: string; // yyyy-mm-dd
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/** "August 1, 2026" | "2026-08-01" → "2026-08-01" (null if unparseable). */
function toIsoDate(raw: string): string | null {
  const iso = raw.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return iso[0];
  const long = raw.match(/\b([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})\b/);
  if (long) {
    const month = MONTHS[long[1].toLowerCase()];
    if (month) {
      return `${long[3]}-${String(month).padStart(2, "0")}-${long[2].padStart(2, "0")}`;
    }
  }
  return null;
}

function parseMoney(raw: string): number | null {
  const n = Number.parseFloat(raw.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 && n <= 1_000_000 ? n : null;
}

/**
 * @param text        extracted PDF text
 * @param ownEmails   the user's own addresses (business email etc.) — never
 *                    suggested as the sender
 */
export function extractInvoiceFields(
  text: string,
  ownEmails: string[],
): InvoiceSuggestions {
  const out: InvoiceSuggestions = {};
  const own = new Set(ownEmails.map((e) => e.trim().toLowerCase()).filter(Boolean));

  // Sender email: first address that isn't one of the user's own.
  const emails = [...text.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)]
    .map((m) => m[0].toLowerCase())
    .filter((e) => !own.has(e));
  if (emails.length) out.contactEmail = emails[0];

  // Sender name: the line after a "From" label (covers letter-spaced headings
  // like "F R O M" that PDF layouts often produce), or a "From: X" line.
  const fromBlock =
    text.match(/^\s*F\s*R\s*O\s*M\s*\n([^\n]+)/im) ??
    text.match(/^from:?\s+([^\n]+)$/im);
  if (fromBlock) {
    const name = fromBlock[1].trim();
    if (name && !name.includes("@") && name.length <= 80) out.senderName = name;
  }

  // Invoice number: explicit label first, then the app's own INV-… format.
  const invNo =
    text.match(/invoice\s*(?:#|no\.?|number)[:\s]*([A-Z0-9][A-Z0-9-]{2,})/i) ??
    text.match(/\b(INV-[0-9A-HJ-NP-Z]{4,})\b/);
  if (invNo) out.invoiceNumber = invNo[1];

  // Amount: prefer the "total (due)" figure; fall back to the largest
  // currency amount on the page.
  const total = text.match(/total(?:\s+due|\s+amount)?\s*:?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i);
  const totalAmount = total ? parseMoney(total[1]) : null;
  if (totalAmount) {
    out.amount = totalAmount;
  } else {
    const all = [...text.matchAll(/\$\s*([\d,]+\.\d{2})\b/g)]
      .map((m) => parseMoney(m[1]))
      .filter((n): n is number => n !== null);
    if (all.length) out.amount = Math.max(...all);
  }

  // Event name: the line following an "EVENT" label (again letter-spacing-
  // tolerant). Generic invoices rarely have one — fine to leave blank.
  const event = text.match(/^\s*E\s*V\s*E\s*N\s*T\s*\n([^\n]+)/im);
  if (event) {
    const name = event[1].trim();
    if (name && name.length <= 120) out.eventName = name;
  }

  // Event date: the line after a "DATE" label if it parses; otherwise only
  // when the document contains exactly ONE distinct date (several dates =
  // issue/due/event ambiguity, so suggest nothing).
  const dateLabel = text.match(/^\s*D\s*A\s*T\s*E\s*\n([^\n]+)/im);
  const labelled = dateLabel ? toIsoDate(dateLabel[1]) : null;
  if (labelled) {
    out.eventDate = labelled;
  } else {
    const found = new Set(
      [...text.matchAll(/\b(?:\d{4}-\d{2}-\d{2}|[A-Za-z]+\s+\d{1,2},?\s+\d{4})\b/g)]
        .map((m) => toIsoDate(m[0]))
        .filter(Boolean) as string[],
    );
    if (found.size === 1) out.eventDate = [...found][0];
  }

  return out;
}
