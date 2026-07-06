import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveInvoiceDir } from "./local-settings";

/**
 * Custom category tags (LOCAL_MODE only).
 *
 * A category tag is the user's own vocabulary for an expense ("Van gas",
 * "Strings") mapped to a real T2125 category. Invoices store the tag NAME;
 * the mapping is resolved at read time, so remapping a tag re-buckets every
 * invoice carrying it on the tax summary. Stored as tags.json inside
 * INVOICE_DIR so they travel with the folder.
 *
 * Event tags (the other kind of tagging) need no registry — they are
 * free-form strings stored directly on each invoice entry.
 */

export interface CategoryTag {
  name: string; // the key, as the user typed it
  taxCategory: string; // T2125 category id (src/lib/t2125.ts)
  createdAt: string; // ISO timestamp
}

const TAGS_NAME = "tags.json";

type TagsDb = Record<string, CategoryTag>;

let writeChain: Promise<unknown> = Promise.resolve();

function chained<T>(op: () => Promise<T>): Promise<T> {
  const p = writeChain.then(op);
  writeChain = p.catch(() => {});
  return p;
}

function file(): string {
  const dir = resolveInvoiceDir();
  if (!dir) throw new Error("No invoice folder configured yet.");
  return path.join(path.resolve(dir), TAGS_NAME);
}

async function readDb(): Promise<TagsDb> {
  try {
    return JSON.parse(await fs.readFile(file(), "utf8")) as TagsDb;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
}

async function writeDb(db: TagsDb): Promise<void> {
  const target = file();
  await fs.mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
  await fs.rename(tmp, target);
}

export async function listCategoryTags(): Promise<CategoryTag[]> {
  const db = await readDb();
  return Object.values(db).sort((a, b) => a.name.localeCompare(b.name));
}

/** Create or remap a tag. The name is the identity; remapping keeps createdAt. */
export async function saveCategoryTag(
  name: string,
  taxCategory: string,
): Promise<CategoryTag> {
  return chained(async () => {
    const key = name.trim();
    if (!key) throw new Error("Tag name is required");
    const db = await readDb();
    const tag: CategoryTag = {
      name: key,
      taxCategory,
      createdAt: db[key]?.createdAt ?? new Date().toISOString(),
    };
    db[key] = tag;
    await writeDb(db);
    return tag;
  });
}

/**
 * Delete a tag definition. Invoices carrying the name keep it, but with no
 * mapping they fall back to their own taxCategory (or show uncategorized).
 */
export async function deleteCategoryTag(name: string): Promise<void> {
  await chained(async () => {
    const db = await readDb();
    delete db[name.trim()];
    await writeDb(db);
  });
}
