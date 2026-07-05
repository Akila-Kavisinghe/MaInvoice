import { NextResponse } from "next/server";
import { syncUser } from "@/lib/sync-auth";
import { config } from "@/lib/config";
import { getGig, removeSubmission } from "@/lib/store";
import { clientIp, rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

/** Bearer-token variant of submission deletion, for the desktop app. */
export async function DELETE(req: Request) {
  const limit = await rateLimit(`sync:${clientIp(req.headers)}`, 60, 5 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Too many requests. Try again in ${limit.retryAfterSeconds}s.` },
      { status: 429 },
    );
  }
  const userEmail = await syncUser(req);
  if (!userEmail) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const email = url.searchParams.get("email");
  if (!token || !email) {
    return NextResponse.json({ error: "Missing token or email" }, { status: 400 });
  }

  const gig = await getGig(token);
  // 404 (not 403) for foreign links so this never confirms they exist.
  if (!gig || (gig.ownerEmail ?? config.superAdminEmail) !== userEmail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await removeSubmission(token, email);
  return NextResponse.json({ ok: true });
}
