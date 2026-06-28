/**
 * Centralised, validated access to environment configuration.
 * Throws early (at first use) if a required secret is missing.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export const config = {
  get bandPassword() {
    return required("BAND_PASSWORD");
  },
  get adminPassword() {
    return required("ADMIN_PASSWORD");
  },
  get sessionSecret() {
    return required("SESSION_SECRET");
  },
  /** Public base URL, no trailing slash. Falls back to localhost in dev. */
  get baseUrl() {
    const raw =
      process.env.NEXT_PUBLIC_BASE_URL?.trim() || "http://localhost:3000";
    return raw.replace(/\/+$/, "");
  },
};
