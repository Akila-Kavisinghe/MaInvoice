import crypto from "node:crypto";
import { cookies } from "next/headers";
import { config } from "./config";
import { isEmailAllowed } from "./store";

/**
 * Stateless, HMAC-signed session cookies (no external auth deps).
 *
 * A cookie value is `base64url(payload).base64url(hmac)` where the HMAC is
 * computed over the payload using SESSION_SECRET. Tamper-evident and
 * verified entirely server-side.
 */

export type Role = "user" | "band";

interface SessionPayload {
  role: Role;
  /** Present on "user" sessions (Google-authenticated bookkeeping users). */
  email?: string;
  name?: string;
  exp: number; // unix seconds
}

const COOKIE_NAME: Record<Role, string> = {
  user: "mi_user",
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

/** Build the signed cookie value for a freshly authenticated band session. */
export function createSessionValue(role: "band"): string {
  return encode({ role, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS });
}

/** Build the signed cookie value for a Google-authenticated user. */
export function createUserSessionValue(email: string, name: string): string {
  return encode({
    role: "user",
    email: email.trim().toLowerCase(),
    name,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  });
}

export function cookieName(role: Role): string {
  return COOKIE_NAME[role];
}

export function sessionCookieOptions(role: Role) {
  return {
    httpOnly: true,
    // Both cookies are "lax": the band cookie is set during a cross-site
    // top-level navigation (link clicked from an email), and the user cookie
    // is set at the end of the Google OAuth redirect chain — a "strict" cookie
    // would not be sent on the post-login navigation, making sign-in appear to
    // fail. CSRF is covered by the sameOrigin() check on every mutating route.
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

/** Read & verify the session for a role from the incoming request cookies. */
export async function hasValidSession(role: Role): Promise<boolean> {
  const token = (await cookies()).get(COOKIE_NAME[role])?.value;
  const payload = decode(token);
  return payload?.role === role;
}

export interface UserSession {
  email: string;
  name: string;
  isSuperAdmin: boolean;
}

/** Decode the signed user cookie. Does NOT check the allowlist — see requireUser. */
export async function getUserSession(): Promise<UserSession | null> {
  const token = (await cookies()).get(COOKIE_NAME.user)?.value;
  const payload = decode(token);
  if (payload?.role !== "user" || !payload.email) return null;
  const email = payload.email.trim().toLowerCase();
  return {
    email,
    name: payload.name ?? "",
    isSuperAdmin: email === config.superAdminEmail,
  };
}

/**
 * Session + live allowlist check. Sessions are stateless (8h), so the
 * allowlist is re-checked on every request — removing a user locks them out
 * immediately, not when their cookie expires.
 */
export async function requireUser(): Promise<UserSession | null> {
  const session = await getUserSession();
  if (!session) return null;
  if (session.isSuperAdmin) return session;
  return (await isEmailAllowed(session.email)) ? session : null;
}

/** Sync tokens are stored server-side only as a SHA-256 hash. */
export function hashSyncToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
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
 * Defense-in-depth CSRF check for state-changing routes: if the browser sent
 * an Origin header, it must match the host the request arrived at. Browsers
 * always send Origin on cross-site fetch/form submissions, so this blocks
 * CSRF even if a SameSite cookie were ever sent. Requests with no Origin
 * (curl, server-to-server) pass — they carry no ambient cookies to abuse.
 */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * Compare a user-supplied password to the configured one in constant time.
 * Both sides are HMACed first so the comparison never branches on length —
 * a plain length check would leak the password's length via response timing.
 */
export function passwordMatches(input: string, expected: string): boolean {
  const key = crypto.randomBytes(32);
  const a = crypto.createHmac("sha256", key).update(input).digest();
  const b = crypto.createHmac("sha256", key).update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}
