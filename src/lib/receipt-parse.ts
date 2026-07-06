/**
 * Pull a payment date out of a receipt's text. Built for e-transfer
 * confirmations (e.g. TD's "Date Sent  May 13, 2026"), but tolerant of the
 * common formats. Returns yyyy-mm-dd or null.
 */

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// "May 13, 2026" / "Sept 3 2026" / "May 13th, 2026"
const MONTH_NAME =
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i;
// ISO "2026-05-13"
const ISO = /\b(\d{4})-(\d{2})-(\d{2})\b/;
// Numeric "05/13/2026" (North American month/day/year — TD's locale)
const NUMERIC = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/;

function iso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year < 1900 || year > 2100) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function findInChunk(chunk: string): string | null {
  const mn = chunk.match(MONTH_NAME);
  if (mn) {
    const month = MONTHS[mn[1].toLowerCase().slice(0, 3)];
    const hit = iso(Number(mn[3]), month, Number(mn[2]));
    if (hit) return hit;
  }
  const im = chunk.match(ISO);
  if (im) {
    const hit = iso(Number(im[1]), Number(im[2]), Number(im[3]));
    if (hit) return hit;
  }
  const nm = chunk.match(NUMERIC);
  if (nm) {
    const hit = iso(Number(nm[3]), Number(nm[1]), Number(nm[2]));
    if (hit) return hit;
  }
  return null;
}

export function extractReceiptDate(text: string): string | null {
  const t = text.replace(/\s+/g, " ");

  // Prefer a date sitting right after a "sent" / "transfer" label so an
  // unrelated date elsewhere on the page doesn't win.
  const label = t.match(/date sent|sent on|date of transfer|transfer date|payment date/i);
  if (label?.index != null) {
    const near = findInChunk(t.slice(label.index, label.index + 60));
    if (near) return near;
  }

  return findInChunk(t);
}
