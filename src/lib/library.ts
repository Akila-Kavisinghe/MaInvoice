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

/** Write a PDF into the folder and index it. Returns the manifest entry. */
export async function addInvoice(
  pdf: Buffer,
  filename: string,
  source: LibraryEntry["source"],
  direction: Direction,
  meta: LibraryMeta,
): Promise<LibraryEntry> {
  return chained(async () => {
    const relDir = destinationDir(direction, meta);
    await fs.mkdir(resolveSafe(relDir), { recursive: true });
    const base = sanitizeSegment(filename.replace(/\.pdf$/i, ""));
    const relPath = await uniquePath(relDir, base, ".pdf");
    await fs.writeFile(resolveSafe(relPath), pdf);

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
      if (entry.relPath === normalized) return entry; // already indexed
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
  patch: { emailReceived?: boolean; paid?: boolean },
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
    await writeManifest(manifest);
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
  const indexed = new Set<string>();
  for (const e of Object.values(manifest.invoices)) {
    indexed.add(e.relPath);
    if (e.receiptPath) indexed.add(e.receiptPath);
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
      } else if (/\.pdf$/i.test(entry.name) && !indexed.has(rel)) {
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
    entry.paidAt = new Date().toISOString();
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
