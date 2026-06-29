import crypto from "node:crypto";

/**
 * Generate a unique, human-friendly invoice number, e.g. "INV-7F3KQ9MZ".
 *
 * Uses Crockford-style base32 (no ambiguous 0/O, 1/I/L) so it's easy to read
 * and read aloud. ~40 bits of randomness → collisions are vanishingly unlikely;
 * the caller additionally guards against collisions within a single gig.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function generateInvoiceNumber(): string {
  const bytes = crypto.randomBytes(8);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % 32];
  return `INV-${out}`;
}
