/**
 * "Save my details for next time" — stores a bandmate's reusable personal info
 * in localStorage on THEIR OWN device only.
 *
 * Deliberately localStorage, not cookies: this PII is never sent to the server
 * (cookies would be attached to every request), which matches the app's goal of
 * keeping personal data off the server. Gig-specific fields (invoice number,
 * amount, notes) are intentionally NOT saved.
 */

const STORAGE_KEY = "mainvoice:bandmate-profile:v1";

export interface BandmateProfile {
  bandmateName: string;
  bandmateEmail: string;
  bandmateAddress: string;
  taxNumber: string;
  paymentMethod: string;
}

export const PROFILE_FIELDS: (keyof BandmateProfile)[] = [
  "bandmateName",
  "bandmateEmail",
  "bandmateAddress",
  "taxNumber",
  "paymentMethod",
];

export function loadProfile(): BandmateProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BandmateProfile>;
    // Only keep known fields, coerced to strings.
    const profile = {} as BandmateProfile;
    for (const key of PROFILE_FIELDS) profile[key] = String(parsed[key] ?? "");
    return profile;
  } catch {
    return null;
  }
}

export function saveProfile(values: BandmateProfile): void {
  if (typeof window === "undefined") return;
  try {
    const profile = {} as BandmateProfile;
    for (const key of PROFILE_FIELDS) profile[key] = values[key] ?? "";
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    /* storage may be full or blocked (private mode) — ignore */
  }
}

export function clearProfile(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
