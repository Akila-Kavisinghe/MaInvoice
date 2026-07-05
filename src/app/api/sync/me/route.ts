import { NextResponse } from "next/server";
import { syncUser } from "@/lib/sync-auth";
import { clientIp, rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

/**
 * Token validation for the desktop app: 200 + identity if the sync token is
 * valid (i.e. its owner is still an authorized user — revoking the token or
 * removing the user kills it), 401 otherwise. The app gates its UI on this.
 */
export async function GET(req: Request) {
  const limit = await rateLimit(`sync:${clientIp(req.headers)}`, 60, 5 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Too many requests. Try again in ${limit.retryAfterSeconds}s.` },
      { status: 429 },
    );
  }

  const email = await syncUser(req);
  if (!email) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  return NextResponse.json({ email });
}
