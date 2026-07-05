import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  AllowedUser,
  Gig,
  PendingInvoice,
  PendingInvoiceMeta,
  Submission,
} from "./types";
import { mergeSubmission } from "./submissions";

/**
 * JSON-file store for LOCAL DEVELOPMENT (persists to ./data/*.json).
 *
 * Used automatically when no Upstash Redis env vars are present. Do NOT use this
 * on Vercel or any host with an ephemeral/read-only filesystem — see store.ts.
 *
 * Files:
 *   gigs.json     -> Record<token, Gig>
 *   meta.json     -> { allowlist, syncTokens }
 *   pending.json  -> Record<id, PendingInvoice>
 */

// MAINVOICE_DATA_DIR is set by the packaged desktop app (read-only cwd);
// everywhere else this stays ./data.
const DATA_DIR =
  process.env.MAINVOICE_DATA_DIR || path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "gigs.json");
const META_FILE = path.join(DATA_DIR, "meta.json");
const PENDING_FILE = path.join(DATA_DIR, "pending.json");

const PENDING_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type Db = Record<string, Gig>;

interface MetaDb {
  allowlist: Record<string, AllowedUser>;
  syncTokens: Record<string, string>; // email -> sha256 of the active token
}

type PendingDb = Record<string, PendingInvoice>;

// Serialise writes so concurrent requests don't clobber the files.
let writeChain: Promise<unknown> = Promise.resolve();

function chained<T>(op: () => Promise<T>): Promise<T> {
  const p = writeChain.then(op);
  writeChain = p.catch(() => {});
  return p;
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw err;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tmp, file); // atomic-ish replace
}

const readDb = () => readJson<Db>(DATA_FILE, {});
const readMeta = () =>
  readJson<MetaDb>(META_FILE, { allowlist: {}, syncTokens: {} });
const readPending = () => readJson<PendingDb>(PENDING_FILE, {});

function isExpired(p: PendingInvoice): boolean {
  return Date.now() - Date.parse(p.createdAt) > PENDING_TTL_MS;
}

// ---------------------------------------------------------------------------
// Gigs
// ---------------------------------------------------------------------------

export async function getGig(token: string): Promise<Gig | null> {
  const db = await readDb();
  return db[token] ?? null;
}

export async function saveGig(gig: Gig): Promise<void> {
  await chained(async () => {
    const db = await readDb();
    db[gig.token] = gig;
    await writeJson(DATA_FILE, db);
  });
}

export async function listGigs(ownerEmail: string): Promise<Gig[]> {
  const db = await readDb();
  return Object.values(db)
    .filter((g) => g.ownerEmail === ownerEmail)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function addSubmission(
  token: string,
  submission: Submission,
): Promise<void> {
  await chained(async () => {
    const db = await readDb();
    const gig = db[token];
    if (!gig) return;
    gig.submissions = mergeSubmission(gig.submissions, submission);
    await writeJson(DATA_FILE, db);
  });
}

export async function deleteGig(token: string): Promise<void> {
  await chained(async () => {
    const db = await readDb();
    delete db[token];
    await writeJson(DATA_FILE, db);
  });
}

export async function migrateLegacyGigs(superAdminEmail: string): Promise<number> {
  return chained(async () => {
    const db = await readDb();
    let migrated = 0;
    for (const gig of Object.values(db)) {
      if (!gig.ownerEmail) {
        gig.ownerEmail = superAdminEmail;
        migrated++;
      }
    }
    if (migrated) await writeJson(DATA_FILE, db);
    return migrated;
  });
}

// ---------------------------------------------------------------------------
// Allowlist
// ---------------------------------------------------------------------------

export async function listAllowedUsers(): Promise<AllowedUser[]> {
  const meta = await readMeta();
  return Object.values(meta.allowlist).sort((a, b) =>
    a.addedAt.localeCompare(b.addedAt),
  );
}

export async function addAllowedUser(user: AllowedUser): Promise<void> {
  await chained(async () => {
    const meta = await readMeta();
    meta.allowlist[user.email] = user;
    await writeJson(META_FILE, meta);
  });
}

export async function removeAllowedUser(email: string): Promise<void> {
  await chained(async () => {
    const meta = await readMeta();
    delete meta.allowlist[email];
    await writeJson(META_FILE, meta);
  });
}

export async function isEmailAllowed(email: string): Promise<boolean> {
  const meta = await readMeta();
  return email in meta.allowlist;
}

// ---------------------------------------------------------------------------
// Sync tokens
// ---------------------------------------------------------------------------

export async function setSyncToken(email: string, hash: string): Promise<void> {
  await chained(async () => {
    const meta = await readMeta();
    meta.syncTokens[email] = hash;
    await writeJson(META_FILE, meta);
  });
}

export async function getSyncTokenEmail(hash: string): Promise<string | null> {
  const meta = await readMeta();
  for (const [email, h] of Object.entries(meta.syncTokens)) {
    if (h === hash) return email;
  }
  return null;
}

export async function revokeSyncToken(email: string): Promise<void> {
  await chained(async () => {
    const meta = await readMeta();
    delete meta.syncTokens[email];
    await writeJson(META_FILE, meta);
  });
}

export async function hasSyncToken(email: string): Promise<boolean> {
  const meta = await readMeta();
  return email in meta.syncTokens;
}

// ---------------------------------------------------------------------------
// Pending invoices
// ---------------------------------------------------------------------------

export async function addPendingInvoice(p: PendingInvoice): Promise<void> {
  await chained(async () => {
    const db = await readPending();
    db[p.id] = p;
    for (const [id, entry] of Object.entries(db)) {
      if (isExpired(entry)) delete db[id]; // enforce the 30-day TTL on write
    }
    await writeJson(PENDING_FILE, db);
  });
}

export async function listPendingInvoices(
  email: string,
): Promise<PendingInvoiceMeta[]> {
  const db = await readPending();
  return Object.values(db)
    .filter((p) => p.ownerEmail === email && !isExpired(p))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(({ pdfBase64: _pdf, ...meta }) => meta);
}

export async function getPendingInvoice(id: string): Promise<PendingInvoice | null> {
  const db = await readPending();
  const p = db[id];
  return p && !isExpired(p) ? p : null;
}

export async function deletePendingInvoice(id: string): Promise<void> {
  await chained(async () => {
    const db = await readPending();
    delete db[id];
    await writeJson(PENDING_FILE, db);
  });
}
