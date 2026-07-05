import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { resolveInvoiceDir } from "./local-settings";
import { sanitizeForFilename } from "./format";

/**
 * Local invoice library (LOCAL_MODE only).
 *
 * INVOICE_DIR is the user's own folder — typically inside Google Drive or
 * Dropbox, so they control cloud backup themselves. The PDF files are the
 * canonical artifacts; manifest.json is the app's index and lives inside the
 * folder so it travels with it:
 *
 *   INVOICE_DIR/
 *     manifest.json
 *     2026/2026-03-14 Spring Gala/Invoice - Jane Doe - Spring Gala - 2026-03-14.pdf
 *     _uploads/2026/receipt.pdf            (manual uploads with no event info)
 */

export interface LibraryEntry {
  id: string;
  /** Path relative to INVOICE_DIR, always with "/" separators. */
  relPath: string;
  source: "sync" | "upload";
  eventName?: string;
  eventDate?: string; // yyyy-mm-dd
  bandmateName?: string;
  invoiceNumber?: string;
  amount?: number;
  notes?: string;
  addedAt: string; // ISO timestamp
}

export interface LibraryMeta {
  eventName?: string;
  eventDate?: string;
  bandmateName?: string;
  invoiceNumber?: string;
  amount?: number;
  notes?: string;
}

interface Manifest {
  version: 1;
  invoices: Record<string, LibraryEntry>;
}

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

async function readManifest(): Promise<Manifest> {
  try {
    const raw = await fs.readFile(path.join(root(), MANIFEST_NAME), "utf8");
    const parsed = JSON.parse(raw) as Manifest;
    return { version: 1, invoices: parsed.invoices ?? {} };
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: 1, invoices: {} };
    }
    throw err;
  }
}

async function writeManifest(manifest: Manifest): Promise<void> {
  await fs.mkdir(root(), { recursive: true });
  const file = path.join(root(), MANIFEST_NAME);
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(manifest, null, 2), "utf8");
  await fs.rename(tmp, file); // atomic-ish replace
}

/** Pick the destination folder for an invoice from its metadata. */
function destinationDir(meta: LibraryMeta): string {
  if (meta.eventDate && meta.eventName) {
    const year = meta.eventDate.slice(0, 4);
    return path.posix.join(year, sanitizeSegment(`${meta.eventDate} ${meta.eventName}`));
  }
  const year = (meta.eventDate ?? new Date().toISOString()).slice(0, 4);
  return path.posix.join("_uploads", year);
}

/** Find a filename that doesn't collide: "name.pdf", "name (2).pdf", … */
async function uniquePath(relDir: string, filename: string): Promise<string> {
  const base = sanitizeSegment(filename.replace(/\.pdf$/i, ""));
  for (let i = 1; i < 100; i++) {
    const name = i === 1 ? `${base}.pdf` : `${base} (${i}).pdf`;
    const rel = path.posix.join(relDir, name);
    try {
      await fs.access(resolveSafe(rel));
    } catch {
      return rel; // doesn't exist yet
    }
  }
  throw new Error(`Too many filename collisions for ${filename}`);
}

/** Write a PDF into the folder and index it. Returns the manifest entry. */
export async function addInvoice(
  pdf: Buffer,
  filename: string,
  source: "sync" | "upload",
  meta: LibraryMeta,
): Promise<LibraryEntry> {
  return chained(async () => {
    const relDir = destinationDir(meta);
    await fs.mkdir(resolveSafe(relDir), { recursive: true });
    const relPath = await uniquePath(relDir, filename);
    await fs.writeFile(resolveSafe(relPath), pdf);

    const entry: LibraryEntry = {
      id: crypto.randomUUID(),
      relPath,
      source,
      ...meta,
      addedAt: new Date().toISOString(),
    };
    const manifest = await readManifest();
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

    const manifest = await readManifest();
    const normalized = relPath.split(path.sep).join("/");
    for (const entry of Object.values(manifest.invoices)) {
      if (entry.relPath === normalized) return entry; // already indexed
    }
    const entry: LibraryEntry = {
      id: crypto.randomUUID(),
      relPath: normalized,
      source: "upload",
      ...meta,
      addedAt: new Date().toISOString(),
    };
    manifest.invoices[entry.id] = entry;
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
 * one-click indexing.
 */
export async function scanUnindexed(): Promise<string[]> {
  const manifest = await readManifest();
  const indexed = new Set(Object.values(manifest.invoices).map((e) => e.relPath));
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

/** Remove an invoice: delete the file and drop it from the manifest. */
export async function deleteInvoice(id: string): Promise<boolean> {
  return chained(async () => {
    const manifest = await readManifest();
    const entry = manifest.invoices[id];
    if (!entry) return false;
    try {
      await fs.unlink(resolveSafe(entry.relPath));
    } catch {
      // Already gone (moved/deleted externally) — still drop the index entry.
    }
    delete manifest.invoices[id];
    await writeManifest(manifest);
    return true;
  });
}
