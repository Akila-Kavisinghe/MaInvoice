import { promises as fs } from "node:fs";
import path from "node:path";
import type { Gig, Submission } from "./types";
import { mergeSubmission } from "./submissions";

/**
 * JSON-file store for LOCAL DEVELOPMENT (persists to ./data/gigs.json).
 *
 * Used automatically when no Upstash Redis env vars are present. Do NOT use this
 * on Vercel or any host with an ephemeral/read-only filesystem — see store.ts.
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
  writeChain = op.catch(() => {});
  await op;
}

export async function listGigs(): Promise<Gig[]> {
  const db = await readDb();
  return Object.values(db).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

export async function addSubmission(
  token: string,
  submission: Submission,
): Promise<void> {
  const op = writeChain.then(async () => {
    const db = await readDb();
    const gig = db[token];
    if (!gig) return;
    gig.submissions = mergeSubmission(gig.submissions, submission);
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
