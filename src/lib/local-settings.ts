import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Local-mode settings chosen from the app UI: the invoice folder and the
 * remote server connection. Stored in <data-dir>/local-settings.json —
 * gitignored, machine-local.
 *
 * The data dir is ./data in a checkout; the packaged desktop app sets
 * MAINVOICE_DATA_DIR to the OS per-user app-data folder because a packaged
 * app's working directory is read-only.
 *
 * Resolution order for every value: app settings → env var → null/prompt.
 */

const DATA_DIR =
  process.env.MAINVOICE_DATA_DIR || path.join(process.cwd(), "data");
const SETTINGS_FILE = path.join(DATA_DIR, "local-settings.json");

export interface BusinessInfo {
  name: string;
  email: string;
  address: string;
  phone: string;
  taxNumber: string;
}

interface LocalSettings {
  invoiceDir?: string;
  remoteUrl?: string;
  remoteToken?: string;
  /** "From" identity on outbound invoices. */
  business?: Partial<BusinessInfo>;
}

let cache: LocalSettings | null = null;

function readSettings(): LocalSettings {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8")) as LocalSettings;
  } catch {
    cache = {};
  }
  return cache;
}

function writeSettings(patch: Partial<LocalSettings>): void {
  const settings = { ...readSettings(), ...patch };
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  const tmp = `${SETTINGS_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2), "utf8");
  fs.renameSync(tmp, SETTINGS_FILE);
  cache = settings;
}

/** Expand a leading "~" so users can type paths the way their shell shows them. */
export function expandHome(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

export function resolveInvoiceDir(): string | null {
  const fromSettings = readSettings().invoiceDir;
  if (fromSettings) return fromSettings;
  const fromEnv = process.env.INVOICE_DIR?.trim();
  return fromEnv ? path.resolve(expandHome(fromEnv)) : null;
}

export function saveInvoiceDir(dir: string): void {
  writeSettings({ invoiceDir: dir });
}

/** The deployed server the local app pulls pending invoices from. */
export function resolveRemoteSync(): { url: string; token: string } | null {
  const s = readSettings();
  if (s.remoteUrl && s.remoteToken) {
    return { url: s.remoteUrl.replace(/\/+$/, ""), token: s.remoteToken };
  }
  const url = process.env.REMOTE_SYNC_URL?.trim();
  const token = process.env.REMOTE_SYNC_TOKEN?.trim();
  return url && token ? { url: url.replace(/\/+$/, ""), token } : null;
}

export function saveRemoteSync(url: string, token: string): void {
  writeSettings({ remoteUrl: url.replace(/\/+$/, ""), remoteToken: token });
}

/**
 * The user's own business details, used as "From" on outbound invoices.
 * App settings win; BUSINESS_* env vars fill any blanks (checkout setups).
 */
export function resolveBusiness(): BusinessInfo {
  const s = readSettings().business ?? {};
  const env = {
    name: process.env.BUSINESS_NAME?.trim() ?? "",
    email: process.env.BUSINESS_EMAIL?.trim() ?? "",
    address: (process.env.BUSINESS_ADDRESS ?? "").replace(/\\n/g, "\n").trim(),
    phone: process.env.BUSINESS_PHONE?.trim() ?? "",
  };
  return {
    name: s.name?.trim() || env.name,
    email: s.email?.trim() || env.email,
    address: s.address?.trim() || env.address,
    phone: s.phone?.trim() || env.phone,
    taxNumber: s.taxNumber?.trim() || "",
  };
}

export function saveBusiness(business: Partial<BusinessInfo>): void {
  writeSettings({ business });
}
