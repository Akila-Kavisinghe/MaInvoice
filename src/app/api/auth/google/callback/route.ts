import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  cookieName,
  createUserSessionValue,
  sessionCookieOptions,
} from "@/lib/auth";
import { config } from "@/lib/config";
import { isEmailAllowed } from "@/lib/store";
import { clientIp, rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

const STATE_COOKIE = "mi_oauth_state";

function failRedirect(reason: string): NextResponse {
  const res = NextResponse.redirect(
    `${config.baseUrl}/admin?error=${encodeURIComponent(reason)}`,
  );
  res.cookies.set(STATE_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

function stateMatches(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Step 2 of the Google OAuth code flow: verify state, exchange the code for
 * an access token, fetch the verified identity, and — only if the email is
 * the super admin or on the allowlist — issue a user session cookie.
 */
export async function GET(req: Request) {
  const limit = await rateLimit(`oauth-cb:${clientIp(req.headers)}`, 10, 5 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${limit.retryAfterSeconds}s.` },
      { status: 429 },
    );
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = (await cookies()).get(STATE_COOKIE)?.value;

  if (!code || !state || !cookieState || !stateMatches(state, cookieState)) {
    return failRedirect("auth");
  }

  // Exchange the authorization code for tokens.
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      redirect_uri: `${config.baseUrl}/api/auth/google/callback`,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    console.error("Google token exchange failed", tokenRes.status);
    return failRedirect("auth");
  }
  const tokens = (await tokenRes.json()) as { access_token?: string };
  if (!tokens.access_token) return failRedirect("auth");

  // Fetch the identity from Google's userinfo endpoint. The access token came
  // straight from Google over TLS, so this response is trustworthy — no need
  // to hand-roll id_token JWT/JWKS verification.
  const userRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!userRes.ok) {
    console.error("Google userinfo failed", userRes.status);
    return failRedirect("auth");
  }
  const info = (await userRes.json()) as {
    email?: string;
    email_verified?: boolean;
    name?: string;
  };
  if (!info.email || info.email_verified !== true) {
    return failRedirect("auth");
  }

  const email = info.email.trim().toLowerCase();
  const allowed =
    email === config.superAdminEmail || (await isEmailAllowed(email));
  if (!allowed) {
    const res = NextResponse.redirect(
      `${config.baseUrl}/admin?error=not-authorized&email=${encodeURIComponent(email)}`,
    );
    res.cookies.set(STATE_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  }

  const res = NextResponse.redirect(`${config.baseUrl}/admin`);
  res.cookies.set(STATE_COOKIE, "", { path: "/", maxAge: 0 });
  res.cookies.set(
    cookieName("user"),
    createUserSessionValue(email, info.name ?? ""),
    sessionCookieOptions("user"),
  );
  return res;
}
