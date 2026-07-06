import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { resolveInvoiceDir } from "./local-settings";
import { sanitizeForFilename } from "./format";

/**
 * Local invoice library (LOCAL_MODE only).
 *
 * INVOICE_DIR is the user's own folder — typically inside Google Drive or
 * iCloud, so they control cloud backup themselves. The PDF files are the
 * canonical artifacts; manifest.json is the app's index and lives inside the
 * folder so it travels with it:
 *
 *   INVOICE_DIR/
 *     manifest.json                 (v2)
 *     Inbound/2026/2026-03-14 Spring Gala/Invoice - Jane Doe - ….pdf
 *     Inbound/_uploads/2026/receipt.pdf     (manual uploads, no event info)
 *     Outbound/2026/2026-07-20 City Jazz Festival/Invoice - ….pdf
 *
 * Payment receipts live NEXT TO their invoice ("Receipt - <invoice name>.<ext>")
 * so an invoice and its proof of payment always travel together.
 */

export type Direction = "inbound" | "outbound";

export interface LibraryEntry {
  id: string;
  /** Path relative to INVOICE_DIR, always with "/" separators. */
  relPath: string;
  source: "sync" | "upload" | "generated";
  direction: Direction;
  eventName?: string;
  eventDate?: string; // yyyy-mm-dd
  bandmateName?: string;
  invoiceNumber?: string;
  amount?: number;
  notes?: string;
  /** Lowercased email of the counterparty; links to the contacts store. */
  contactEmail?: string;
  contactName?: string;
  /** Inbound only: user confirmed the sender emailed this invoice in. */
  emailReceived?: boolean;
  /** Payment receipt paired with this invoice (same folder). */
  receiptPath?: string;
  /** Set when a receipt is attached or the row is manually marked paid. */
  paidAt?: string; // ISO timestamp
  /**
   * Server pending-invoice id this entry was synced from. While present, a
   * copy of the PDF still exists on the website — it is only deleted there
   * after the user explicitly confirms removal (or the server's 90-day TTL
   * expires). Also used to dedupe repeat syncs.
   */
  pendingId?: string;
  /**
   * T2125 reporting category (expense-side entries only — outbound invoices
   * are income), assigned manually by the user. See src/lib/t2125.ts.
   * "capital-assets" marks purchases that may need CCA treatment instead of
   * full expensing.
   */
  taxCategory?: string;
  /**
   * Custom category tag NAME (see src/lib/tags.ts). When set and the tag
   * still exists, its mapped T2125 category takes precedence over
   * taxCategory on the tax summary.
   */
  categoryTag?: string;
  /** Free-form grouping tags ("Summer Tour 2026") for slicing expenses. */
  eventTags?: string[];
  addedAt: string; // ISO timestamp
}

export interface LibraryMeta {
  eventName?: string;
  eventDate?: string;
  bandmateName?: string;
  invoiceNumber?: string;
  amount?: number;
  notes?: string;
  contactEmail?: string;
  contactName?: string;
  pendingId?: string;
}

interface Manifest {
  version: number;
  invoices: Record<string, LibraryEntry>;
}

const MANIFEST_VERSION = 2;
const MANIFEST_NAME = "manifest.json";

// Serialise writes so concurrent requests don't clobber the manifest.
let writeChain: Promise<unknown> = Promise.resolve();

function chained<T>(op: () => Promise<T>): Promise<T> {
  const p = writeChain.then(op);
  writeChain = p.catch(() => {});
  return p;
}

function root(): string {
  const dir = resolveInvoiceDir();
  if (!dir) {
    // Routes check hasInvoiceDir() first; this is a backstop.
    throw new Error("No invoice folder configured yet.");
  }
  return path.resolve(dir);
}

export function hasInvoiceDir(): boolean {
  return resolveInvoiceDir() !== null;
}

/**
 * Resolve a relative path inside INVOICE_DIR, refusing anything that escapes
 * it (path traversal guard — applied to every read and write).
 */
function resolveSafe(relPath: string): string {
  const abs = path.resolve(root(), relPath);
  if (abs !== root() && !abs.startsWith(root() + path.sep)) {
    throw new Error(`Path escapes the invoice folder: ${relPath}`);
  }
  return abs;
}

/** A single path segment safe for any filesystem (and never "..", never hidden). */
function sanitizeSegment(input: string): string {
  const clean = sanitizeForFilename(input)
    .replace(/^\.+/, "")
    .slice(0, 120)
    .trim();
  return clean || "untitled";
}

async function readManifestRaw(): Promise<Manifest> {
  try {
    const raw = await fs.readFile(path.join(root(), MANIFEST_NAME), "utf8");
    const parsed = JSON.parse(raw) as Manifest;
    return { version: parsed.version ?? 1, invoices: parsed.invoices ?? {} };
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: MANIFEST_VERSION, invoices: {} };
    }
    throw err;
  }
}

async function readManifest(): Promise<Manifest> {
  const manifest = await readManifestRaw();
  if (manifest.version < MANIFEST_VERSION) {
    return migrateManifest();
  }
  return manifest;
}

async function writeManifest(manifest: Manifest): Promise<void> {
  await fs.mkdir(root(), { recursive: true });
  const file = path.join(root(), MANIFEST_NAME);
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(manifest, null, 2), "utf8");
  await fs.rename(tmp, file); // atomic-ish replace
}

/**
 * v1 → v2: entries gain direction ("inbound" — outbound didn't exist yet) and
 * files physically move under Inbound/ so the top level is Inbound/ + Outbound/.
 * Idempotent; a file missing on disk keeps its entry as-is (the unindexed
 * rescan is the recovery path).
 */
function migrateManifest(): Promise<Manifest> {
  return chained(async () => {
    const manifest = await readManifestRaw();
    if (manifest.version >= MANIFEST_VERSION) return manifest; // raced

    for (const entry of Object.values(manifest.invoices)) {
      entry.direction = entry.direction ?? "inbound";
      if (entry.bandmateName && !entry.contactName) {
        entry.contactName = entry.bandmateName;
      }
      if (
        entry.relPath.startsWith("Inbound/") ||
        entry.relPath.startsWith("Outbound/")
      ) {
        continue;
      }
      const newRel = path.posix.join("Inbound", entry.relPath);
      try {
        await fs.mkdir(path.dirname(resolveSafe(newRel)), { recursive: true });
        await fs.rename(resolveSafe(entry.relPath), resolveSafe(newRel));
        entry.relPath = newRel;
      } catch (err) {
        console.error("library migration: couldn't move", entry.relPath, err);
      }
    }

    manifest.version = MANIFEST_VERSION;
    await writeManifest(manifest);
    return manifest;
  });
}

/** Pick the destination folder for an invoice from its metadata. */
function destinationDir(direction: Direction, meta: LibraryMeta): string {
  const top = direction === "outbound" ? "Outbound" : "Inbound";
  if (meta.eventDate && meta.eventName) {
    const year = meta.eventDate.slice(0, 4);
    return path.posix.join(
      top,
      year,
      sanitizeSegment(`${meta.eventDate} ${meta.eventName}`),
    );
  }
  const year = (meta.eventDate ?? new Date().toISOString()).slice(0, 4);
  return path.posix.join(top, "_uploads", year);
}

/** Find a filename that doesn't collide: "name.pdf", "name (2).pdf", … */
async function uniquePath(
  relDir: string,
  base: string,
  ext: string,
): Promise<string> {
  for (let i = 1; i < 100; i++) {
    const name = i === 1 ? `${base}${ext}` : `${base} (${i})${ext}`;
    const rel = path.posix.join(relDir, name);
    try {
      await fs.access(resolveSafe(rel));
    } catch {
      return rel; // doesn't exist yet
    }
  }
  throw new Error(`Too many filename collisions for ${base}${ext}`);
}

/**
 * macOS/Windows filesystems are case-insensitive: mkdir "…Fifa…" silently
 * lands in an existing "…FIFA…" folder. Manifest paths must record the
 * on-disk casing or exact-string comparisons (unindexed scan, dedupe)
 * misfire and produce duplicate entries. Call only after the dir exists.
 */
async function actualCaseRelDir(relDir: string): Promise<string> {
  try {
    const [rootReal, dirReal] = await Promise.all([
      fs.realpath(root()),
      fs.realpath(resolveSafe(relDir)),
    ]);
    const rel = path.relative(rootReal, dirReal);
    if (!rel || rel.startsWith("..")) return relDir;
    return rel.split(path.sep).join("/");
  } catch {
    return relDir;
  }
}

/** Write a PDF into the folder and index it. Returns the manifest entry. */
export async function addInvoice(
  pdf: Buffer,
  filename: string,
  source: LibraryEntry["source"],
  direction: Direction,
  meta: LibraryMeta,
): Promise<LibraryEntry> {
  return chained(async () => {
    await fs.mkdir(resolveSafe(destinationDir(direction, meta)), { recursive: true });
    const relDir = await actualCaseRelDir(destinationDir(direction, meta));
    const base = sanitizeSegment(filename.replace(/\.pdf$/i, ""));
    const relPath = await uniquePath(relDir, base, ".pdf");
    await fs.writeFile(resolveSafe(relPath), pdf);

    // Tax categories are assigned manually — new entries start uncategorized
    // and show up in the Taxes page's to-do banner until the user labels them.
    const entry: LibraryEntry = {
      id: crypto.randomUUID(),
      relPath,
      source,
      direction,
      ...meta,
      contactEmail: meta.contactEmail?.trim().toLowerCase() || undefined,
      addedAt: new Date().toISOString(),
    };
    const manifest = await readManifestRaw();
    manifest.invoices[entry.id] = entry;
    await writeManifest(manifest);
    return entry;
  });
}

/** Adopt a PDF that's already in the folder (e.g. dropped in via Drive). */
export async function indexFile(
  relPath: string,
  meta: LibraryMeta,
): Promise<LibraryEntry> {
  return chained(async () => {
    const abs = resolveSafe(relPath);
    const stat = await fs.stat(abs); // throws if missing
    if (!stat.isFile()) throw new Error("Not a file");

    const manifest = await readManifestRaw();
    const normalized = relPath.split(path.sep).join("/");
    for (const entry of Object.values(manifest.invoices)) {
      // Case-insensitive: an entry may record different casing than disk.
      if (entry.relPath.toLowerCase() === normalized.toLowerCase()) {
        return entry; // already indexed
      }
    }
    const entry: LibraryEntry = {
      id: crypto.randomUUID(),
      relPath: normalized,
      source: "upload",
      direction: normalized.startsWith("Outbound/") ? "outbound" : "inbound",
      ...meta,
      contactEmail: meta.contactEmail?.trim().toLowerCase() || undefined,
      addedAt: new Date().toISOString(),
    };
    manifest.invoices[entry.id] = entry;
    await writeManifest(manifest);
    return entry;
  });
}

/** Update mutable flags/fields on an entry. Returns the updated entry. */
export async function updateInvoice(
  id: string,
  patch: {
    emailReceived?: boolean;
    paid?: boolean;
    taxCategory?: string | null;
    categoryTag?: string | null;
    eventTags?: string[];
    // Detail edits: undefined = untouched, "" (or null amount) = cleared.
    eventName?: string;
    eventDate?: string;
    contactName?: string;
    contactEmail?: string;
    invoiceNumber?: string;
    amount?: number | null;
    notes?: string;
  },
): Promise<LibraryEntry | null> {
  return chained(async () => {
    const manifest = await readManifestRaw();
    const entry = manifest.invoices[id];
    if (!entry) return null;
    if (typeof patch.emailReceived === "boolean") {
      entry.emailReceived = patch.emailReceived;
    }
    if (typeof patch.paid === "boolean") {
      // Marking unpaid clears the timestamp but keeps any receipt file.
      entry.paidAt = patch.paid ? new Date().toISOString() : undefined;
    }
    if (patch.taxCategory !== undefined) {
      entry.taxCategory = patch.taxCategory ?? undefined;
    }
    if (patch.categoryTag !== undefined) {
      entry.categoryTag = patch.categoryTag || undefined;
    }
    if (patch.eventTags !== undefined) {
      const tags = [...new Set(patch.eventTags.map((t) => t.trim()).filter(Boolean))];
      entry.eventTags = tags.length ? tags : undefined;
    }

    if (patch.eventName !== undefined) entry.eventName = patch.eventName || undefined;
    if (patch.eventDate !== undefined) entry.eventDate = patch.eventDate || undefined;
    if (patch.contactName !== undefined) {
      entry.contactName = patch.contactName || undefined;
    }
    if (patch.contactEmail !== undefined) {
      entry.contactEmail = patch.contactEmail ? patch.contactEmail.toLowerCase() : undefined;
    }
    if (patch.invoiceNumber !== undefined) {
      entry.invoiceNumber = patch.invoiceNumber || undefined;
    }
    if (patch.amount !== undefined) entry.amount = patch.amount ?? undefined;
    if (patch.notes !== undefined) entry.notes = patch.notes || undefined;

    // The folder is derived from the event ("<year>/<date event>/"), so an
    // event edit re-files the PDF (and its receipt). Best-effort: if a move
    // fails the entry keeps its old path — metadata is still updated.
    if (patch.eventName !== undefined || patch.eventDate !== undefined) {
      const wantedDir = destinationDir(entry.direction ?? "inbound", {
        eventName: entry.eventName,
        eventDate: entry.eventDate,
      });
      const oldDir = path.posix.dirname(entry.relPath);
      await fs.mkdir(resolveSafe(wantedDir), { recursive: true }).catch(() => {});
      // Canonical on-disk casing — a case-only event edit resolves to the
      // SAME physical folder, and moving a file onto itself would trip the
      // collision suffix and duplicate it.
      const newDir = await actualCaseRelDir(wantedDir);
      if (newDir.toLowerCase() !== oldDir.toLowerCase()) {
        for (const key of ["relPath", "receiptPath"] as const) {
          const rel = entry[key];
          if (!rel) continue;
          try {
            const ext = path.posix.extname(rel);
            const base = path.posix.basename(rel, ext);
            const newRel = await uniquePath(newDir, base, ext);
            await fs.rename(resolveSafe(rel), resolveSafe(newRel));
            entry[key] = newRel; // recorded per file, right after its rename
          } catch (err) {
            console.error("library: couldn't re-file", rel, err);
          }
        }
        // Drop the old event folder if the moves emptied it.
        await fs.rmdir(resolveSafe(oldDir)).catch(() => {});
      }
    }

    await writeManifest(manifest);
    return entry;
  });
}

/** Look up one entry without touching its file. */
export async function getInvoiceEntry(id: string): Promise<LibraryEntry | null> {
  const manifest = await readManifest();
  return manifest.invoices[id] ?? null;
}

/** The user confirmed the website copy was removed — stop tracking it. */
export async function clearServerCopy(id: string): Promise<LibraryEntry | null> {
  return chained(async () => {
    const manifest = await readManifestRaw();
    const entry = manifest.invoices[id];
    if (!entry) return null;
    if (entry.pendingId) {
      entry.pendingId = undefined;
      await writeManifest(manifest);
    }
    return entry;
  });
}

/** All indexed invoices, newest first. */
export async function listInvoices(): Promise<LibraryEntry[]> {
  const manifest = await readManifest();
  return Object.values(manifest.invoices).sort((a, b) =>
    b.addedAt.localeCompare(a.addedAt),
  );
}

/**
 * PDFs on disk that aren't in the manifest — files the user dropped into the
 * folder by hand (or synced in from another machine). Surfaced in the UI for
 * one-click indexing. Receipts are indexed via their invoice, not listed here.
 */
export async function scanUnindexed(): Promise<string[]> {
  const manifest = await readManifest();
  // Lowercased: on case-insensitive filesystems the on-disk casing can
  // legitimately differ from the manifest's.
  const indexed = new Set<string>();
  for (const e of Object.values(manifest.invoices)) {
    indexed.add(e.relPath.toLowerCase());
    if (e.receiptPath) indexed.add(e.receiptPath.toLowerCase());
  }
  const found: string[] = [];

  async function walk(relDir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(resolveSafe(relDir), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue; // hidden / Drive metadata
      const rel = relDir ? path.posix.join(relDir, entry.name) : entry.name;
      if (entry.isDirectory()) {
        await walk(rel);
      } else if (/\.pdf$/i.test(entry.name) && !indexed.has(rel.toLowerCase())) {
        found.push(rel);
      }
    }
  }

  await walk("");
  return found.sort();
}

export async function getInvoiceFile(
  id: string,
): Promise<{ entry: LibraryEntry; pdf: Buffer } | null> {
  const manifest = await readManifest();
  const entry = manifest.invoices[id];
  if (!entry) return null;
  try {
    return { entry, pdf: await fs.readFile(resolveSafe(entry.relPath)) };
  } catch {
    return null; // file was moved/deleted outside the app
  }
}

/** Remove an invoice: delete the file (and its receipt) and drop the entry. */
export async function deleteInvoice(id: string): Promise<boolean> {
  return chained(async () => {
    const manifest = await readManifestRaw();
    const entry = manifest.invoices[id];
    if (!entry) return false;
    for (const rel of [entry.relPath, entry.receiptPath]) {
      if (!rel) continue;
      try {
        await fs.unlink(resolveSafe(rel));
      } catch {
        // Already gone (moved/deleted externally) — still drop the index entry.
      }
    }
    delete manifest.invoices[id];
    await writeManifest(manifest);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Receipts (fulfillment)
// ---------------------------------------------------------------------------

/**
 * Attach a payment receipt to an invoice. Any file type; stored in the SAME
 * folder as the invoice as "Receipt - <invoice basename>.<ext>". Marks the
 * invoice paid. Replacing an existing receipt removes the old file.
 */
export async function attachReceipt(
  id: string,
  file: Buffer,
  originalFilename: string,
  /** yyyy-mm-dd the payment happened; defaults to today. */
  paidDate?: string,
): Promise<LibraryEntry | null> {
  return chained(async () => {
    const manifest = await readManifestRaw();
    const entry = manifest.invoices[id];
    if (!entry) return null;

    const ext = (path.extname(originalFilename) || ".bin")
      .toLowerCase()
      .replace(/[^.a-z0-9]/g, "")
      .slice(0, 10);
    const dir = path.posix.dirname(entry.relPath);
    const invoiceBase = path.posix
      .basename(entry.relPath)
      .replace(/\.pdf$/i, "");
    const base = sanitizeSegment(`Receipt - ${invoiceBase}`);

    if (entry.receiptPath) {
      try {
        await fs.unlink(resolveSafe(entry.receiptPath));
      } catch {
        /* old receipt already gone */
      }
    }

    const relPath = await uniquePath(dir, base, ext.startsWith(".") ? ext : `.${ext}`);
    await fs.writeFile(resolveSafe(relPath), file);

    entry.receiptPath = relPath;
    // Noon UTC keeps the chosen calendar date stable in every timezone.
    entry.paidAt = paidDate
      ? `${paidDate}T12:00:00.000Z`
      : new Date().toISOString();
    await writeManifest(manifest);
    return entry;
  });
}

export async function getReceiptFile(
  id: string,
): Promise<{ entry: LibraryEntry; file: Buffer } | null> {
  const manifest = await readManifest();
  const entry = manifest.invoices[id];
  if (!entry?.receiptPath) return null;
  try {
    return { entry, file: await fs.readFile(resolveSafe(entry.receiptPath)) };
  } catch {
    return null;
  }
}

/** Detach and delete the receipt file. Keeps paidAt (toggle that separately). */
export async function removeReceipt(id: string): Promise<LibraryEntry | null> {
  return chained(async () => {
    const manifest = await readManifestRaw();
    const entry = manifest.invoices[id];
    if (!entry) return null;
    if (entry.receiptPath) {
      try {
        await fs.unlink(resolveSafe(entry.receiptPath));
      } catch {
        /* already gone */
      }
      entry.receiptPath = undefined;
      await writeManifest(manifest);
    }
    return entry;
  });
}
