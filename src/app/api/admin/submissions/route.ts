import { NextResponse } from "next/server";
import { requireUser, sameOrigin } from "@/lib/auth";
import { config } from "@/lib/config";
import { getGig, removeSubmission } from "@/lib/store";

export const runtime = "nodejs";

/** Delete one submission record from one of YOUR links (keyed by email). */
export async function DELETE(req: Request) {
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  }
  const session = await requireUser();
  if (!session) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const email = url.searchParams.get("email");
  if (!token || !email) {
    return NextResponse.json({ error: "Missing token or email" }, { status: 400 });
  }

  const gig = await getGig(token);
  if (!gig) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const owner = gig.ownerEmail ?? config.superAdminEmail;
  if (owner !== session.email) {
    return NextResponse.json({ error: "Not your link" }, { status: 403 });
  }

  await removeSubmission(token, email);
  return NextResponse.json({ ok: true });
}
