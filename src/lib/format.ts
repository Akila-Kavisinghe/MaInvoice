/** Isomorphic formatting helpers (safe on both server and client). */

const money = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
});

export function formatMoney(amount: number): string {
  return money.format(amount);
}

/** "2026-06-28" -> "June 28, 2026". Falls back to the raw string. */
export function formatDate(iso?: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Strip characters that are unsafe/awkward in filenames. */
export function sanitizeForFilename(input: string): string {
  return input
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** "Invoice - Jane Doe - Summer Fest - 2026-06-28.pdf" */
export function invoiceFilename(
  bandmateName: string,
  eventName: string,
  eventDate: string,
): string {
  const parts = [
    "Invoice",
    sanitizeForFilename(bandmateName) || "Bandmate",
    sanitizeForFilename(eventName) || "Event",
    eventDate,
  ];
  return `${parts.join(" - ")}.pdf`;
}
