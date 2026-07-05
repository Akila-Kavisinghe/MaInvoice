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
  get sessionSecret() {
    return required("SESSION_SECRET");
  },
  get googleClientId() {
    return required("GOOGLE_CLIENT_ID");
  },
  get googleClientSecret() {
    return required("GOOGLE_CLIENT_SECRET");
  },
  /** The one account that manages the user allowlist. Always allowed to sign in. */
  get superAdminEmail() {
    return required("SUPER_ADMIN_EMAIL").trim().toLowerCase();
  },

  /**
   * Local library mode: the app runs on the user's own machine and organizes
   * invoices into INVOICE_DIR instead of serving the hosted platform.
   */
  get localMode() {
    return process.env.LOCAL_MODE === "1";
  },
  /** Public base URL, no trailing slash. Falls back to localhost in dev. */
  get baseUrl() {
    const raw =
      process.env.NEXT_PUBLIC_BASE_URL?.trim() || "http://localhost:3000";
    return raw.replace(/\/+$/, "");
  },

  /**
   * Your fixed business details, used to prefill the admin form so you never
   * retype them. All optional — blank fields just aren't prefilled. Use "\n" in
   * BUSINESS_ADDRESS for multiple lines.
   */
  get business() {
    return {
      name: process.env.BUSINESS_NAME?.trim() ?? "",
      contact: process.env.BUSINESS_CONTACT?.trim() ?? "",
      address: (process.env.BUSINESS_ADDRESS ?? "").replace(/\\n/g, "\n").trim(),
      phone: process.env.BUSINESS_PHONE?.trim() ?? "",
      email: process.env.BUSINESS_EMAIL?.trim() ?? "",
    };
  },
};

export interface BusinessDefaults {
  name: string;
  contact: string;
  address: string;
  phone: string;
  email: string;
}
