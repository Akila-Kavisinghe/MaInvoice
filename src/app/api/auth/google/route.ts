import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { config } from "@/lib/config";

export const runtime = "nodejs";

// Next.js forbids extra exports from route files, so the callback route
// duplicates this name.
const STATE_COOKIE = "mi_oauth_state";

/**
 * Step 1 of the Google OAuth code flow: stash a random state value in a
 * short-lived cookie and send the user to Google's consent screen.
 */
export async function GET() {
  const state = crypto.randomBytes(32).toString("base64url");

  const params = new URLSearchParams({
    client_id: config.googleClientId,
    // Always built from config, never from request headers, so a spoofed Host
    // header can't redirect the code elsewhere.
    redirect_uri: `${config.baseUrl}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });

  const res = NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
  );
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    // Lax so the cookie survives the cross-site return redirect from Google.
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return res;
}
