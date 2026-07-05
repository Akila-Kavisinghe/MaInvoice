import { NextResponse } from "next/server";
import {
  createSessionValue,
  cookieName,
  sessionCookieOptions,
  verifyUnlockKey,
} from "@/lib/auth";
import { getGig } from "@/lib/store";

export const runtime = "nodejs";

/**
 * Auto-unlock via a per-link key. The server component redirects here when a
 * share link includes `?k=...` and there is no band session yet. On success we
 * set the band session cookie and bounce to the clean invoice URL (no key in
 * the address bar). On failure we send them to the normal password gate.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const key = url.searchParams.get("k") ?? "";

  const clean = new URL(`/i/${encodeURIComponent(token)}`, url.origin);

  // Only unlock for a real, non-archived gig with a valid per-link key.
  const gig = token ? await getGig(token) : null;
  if (!gig || gig.archivedAt || !verifyUnlockKey(token, key)) {
    return NextResponse.redirect(clean); // falls through to the password gate
  }

  const res = NextResponse.redirect(clean);
  res.cookies.set(cookieName("band"), createSessionValue("band"), sessionCookieOptions("band"));
  return res;
}
