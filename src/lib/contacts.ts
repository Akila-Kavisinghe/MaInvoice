import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveInvoiceDir } from "./local-settings";

/**
 * Contact cards for invoice counterparties (LOCAL_MODE only).
 *
 * Stored as contacts.json inside INVOICE_DIR so they travel with the folder.
 * Contacts are auto-created when an invoice arrives from a new sender (sync)
 * or when an outbound invoice is issued to a new client; sync data only ever
 * fills blanks — it never overwrites fields the user edited.
 */

export interface Contact {
  email: string; // lowercased; the key
  name: string;
  address?: string;
  phone?: string;
  notes?: string;
  createdAt: string; // ISO timestamp
}

const CONTACTS_NAME = "contacts.json";

type ContactsDb = Record<string, Contact>;

let writeChain: Promise<unknown> = Promise.resolve();

function chained<T>(op: () => Promise<T>): Promise<T> {
  const p = writeChain.then(op);
  writeChain = p.catch(() => {});
  return p;
}

function file(): string {
  const dir = resolveInvoiceDir();
  if (!dir) throw new Error("No invoice folder configured yet.");
  return path.join(path.resolve(dir), CONTACTS_NAME);
}

async function readDb(): Promise<ContactsDb> {
  try {
    return JSON.parse(await fs.readFile(file(), "utf8")) as ContactsDb;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
}

async function writeDb(db: ContactsDb): Promise<void> {
  const target = file();
  await fs.mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
  await fs.rename(tmp, target);
}

export async function listContacts(): Promise<Contact[]> {
  const db = await readDb();
  return Object.values(db).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Create the contact if new; otherwise only fill in fields that are blank
 * (auto-created data must never clobber the user's edits). Returns the
 * stored contact.
 */
export async function upsertContact(
  input: Partial<Contact> & { email: string },
): Promise<Contact> {
  return chained(async () => {
    const email = input.email.trim().toLowerCase();
    const db = await readDb();
    const existing = db[email];
    const contact: Contact = existing
      ? {
          ...existing,
          name: existing.name || input.name || email,
          address: existing.address || input.address,
          phone: existing.phone || input.phone,
          notes: existing.notes || input.notes,
        }
      : {
          email,
          name: input.name?.trim() || email,
          address: input.address,
          phone: input.phone,
          notes: input.notes,
          createdAt: new Date().toISOString(),
        };
    db[email] = contact;
    await writeDb(db);
    return contact;
  });
}

/** Explicit edit from the UI — overwrites the provided fields. */
export async function saveContact(
  input: Partial<Contact> & { email: string },
): Promise<Contact> {
  return chained(async () => {
    const email = input.email.trim().toLowerCase();
    const db = await readDb();
    const existing = db[email];
    const contact: Contact = {
      email,
      name: input.name?.trim() || existing?.name || email,
      address: input.address ?? existing?.address,
      phone: input.phone ?? existing?.phone,
      notes: input.notes ?? existing?.notes,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    db[email] = contact;
    await writeDb(db);
    return contact;
  });
}

export async function deleteContact(email: string): Promise<void> {
  await chained(async () => {
    const db = await readDb();
    delete db[email.trim().toLowerCase()];
    await writeDb(db);
  });
}
