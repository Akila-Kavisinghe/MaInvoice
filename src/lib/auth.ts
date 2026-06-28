import crypto from "node:crypto";
import { cookies } from "next/headers";
import { config } from "./config";

/**
 * Stateless, HMAC-signed session cookies (no external auth deps).
 *
 * A cookie value is `base64url(payload).base64url(hmac)` where the HMAC is
 * computed over the payload using SESSION_SECRET. Tamper-evident and
 * verified entirely server-side.
 */

export type Role = "admin" | "band";

interface SessionPayload {
  role: Role;
  exp: number; // unix seconds
}

const COOKIE_NAME: Record<Role, string> = {
  admin: "mi_admin",
  band: "mi_band",
};

const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 hours

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function sign(payloadB64: string): string {
  return crypto
    .createHmac("sha256", config.sessionSecret)
    .update(payloadB64)
    .digest("base64url");
}

function encode(payload: SessionPayload): string {
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload)));
  return `${payloadB64}.${sign(payloadB64)}`;
}

function decode(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const [payloadB64, mac] = token.split(".");
  if (!payloadB64 || !mac) return null;

  const expected = sign(payloadB64);
  // Constant-time comparison to avoid timing leaks.
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8"),
    ) as SessionPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Build the signed cookie value for a freshly authenticated role. */
export function createSessionValue(role: Role): string {
  return encode({ role, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS });
}

export function cookieName(role: Role): string {
  return COOKIE_NAME[role];
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_TTL_SECONDS,
};

/** Read & verify the session for a role from the incoming request cookies. */
export function hasValidSession(role: Role): boolean {
  const token = cookies().get(COOKIE_NAME[role])?.value;
  const payload = decode(token);
  return payload?.role === role;
}

/**
 * Per-link auto-unlock key.
 *
 * A value unique to each gig link: HMAC("unlock:" + token). Embedded in the
 * share URL as `?k=...` so bandmates don't have to type the shared password.
 * Safe to put in a URL because it is per-link (a leak burns only that one gig,
 * which can be revoked) and never exposes the global shared password.
 */
export function createUnlockKey(token: string): string {
  return crypto
    .createHmac("sha256", config.sessionSecret)
    .update(`unlock:${token}`)
    .digest("base64url");
}

export function verifyUnlockKey(token: string, key: string | undefined): boolean {
  if (!key) return false;
  const expected = createUnlockKey(token);
  const a = Buffer.from(key);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Compare a user-supplied password to the configured one in constant time.
 */
export function passwordMatches(input: string, expected: string): boolean {
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
