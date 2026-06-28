import { promises as fs } from "node:fs";
import path from "node:path";
import type { Gig, Submission } from "./types";

/**
 * Minimal JSON-file store for gig links.
 *
 * This is intentionally simple for a self-hosted, low-traffic app. It persists
 * to ./data/gigs.json on the local filesystem.
 *
 * NOTE: This will NOT work on platforms with an ephemeral/read-only filesystem
 * (e.g. Vercel serverless). For those, swap this module for a real database
 * (SQLite, Postgres, Upstash/Redis, etc.) — the public API below is all the
 * rest of the app depends on.
 */

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "gigs.json");

type Db = Record<string, Gig>;

// Serialise writes so concurrent requests don't clobber the file.
let writeChain: Promise<unknown> = Promise.resolve();

async function readDb(): Promise<Db> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    return JSON.parse(raw) as Db;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
}

async function writeDb(db: Db): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${DATA_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
  await fs.rename(tmp, DATA_FILE); // atomic-ish replace
}

export async function getGig(token: string): Promise<Gig | null> {
  const db = await readDb();
  return db[token] ?? null;
}

export async function saveGig(gig: Gig): Promise<void> {
  const op = writeChain.then(async () => {
    const db = await readDb();
    db[gig.token] = gig;
    await writeDb(db);
  });
  // Keep the chain alive even if this op throws.
  writeChain = op.catch(() => {});
  await op;
}

export async function listGigs(): Promise<Gig[]> {
  const db = await readDb();
  return Object.values(db).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

/** Append a submission record to a gig. No-op if the gig is gone. */
export async function addSubmission(
  token: string,
  submission: Submission,
): Promise<void> {
  const op = writeChain.then(async () => {
    const db = await readDb();
    const gig = db[token];
    if (!gig) return;
    gig.submissions = [...(gig.submissions ?? []), submission];
    await writeDb(db);
  });
  writeChain = op.catch(() => {});
  await op;
}

export async function deleteGig(token: string): Promise<void> {
  const op = writeChain.then(async () => {
    const db = await readDb();
    delete db[token];
    await writeDb(db);
  });
  writeChain = op.catch(() => {});
  await op;
}
