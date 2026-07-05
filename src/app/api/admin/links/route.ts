import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createUnlockKey, requireUser, sameOrigin } from "@/lib/auth";
import { config } from "@/lib/config";
import {
  deleteGig,
  getGig,
  hasSyncToken,
  listGigs,
  migrateLegacyGigs,
  saveGig,
} from "@/lib/store";
import { gigCreateSchema } from "@/lib/validation";
import type { Gig } from "@/lib/types";

export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ error: "Not authorized" }, { status: 401 });
}

export async function GET() {
  const session = await requireUser();
  if (!session) return unauthorized();

  // Adopt any pre-multi-user gigs into the super admin's account. Idempotent
  // and cheap once drained.
  if (session.isSuperAdmin) {
    try {
      await migrateLegacyGigs(session.email);
    } catch (err) {
      console.error("legacy gig migration failed", err);
    }
  }

  const gigs = await listGigs(session.email);
  const baseUrl = config.baseUrl;
  return NextResponse.json({
    user: {
      email: session.email,
      name: session.name,
      isSuperAdmin: session.isSuperAdmin,
      hasSyncToken: await hasSyncToken(session.email),
    },
    defaults: config.business,
    gigs: gigs.map((g) => ({
      token: g.token,
      eventName: g.eventName,
      eventDate: g.eventDate,
      createdAt: g.createdAt,
      url: `${baseUrl}/i/${g.token}?k=${createUnlockKey(g.token)}`,
      submissions: g.submissions ?? [],
    })),
  });
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  }
  const session = await requireUser();
  if (!session) return unauthorized();

  const parsed = gigCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const token = crypto.randomBytes(24).toString("base64url");
  const gig: Gig = {
    token,
    createdAt: new Date().toISOString(),
    ownerEmail: session.email,
    ...parsed.data,
  };
  await saveGig(gig);

  return NextResponse.json({
    token,
    url: `${config.baseUrl}/i/${token}?k=${createUnlockKey(token)}`,
  });
}

export async function DELETE(req: Request) {
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  }
  const session = await requireUser();
  if (!session) return unauthorized();

  const token = new URL(req.url).searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  // Only the link's owner may revoke it (legacy owner-less gigs belong to the
  // super admin).
  const gig = await getGig(token);
  if (!gig) return NextResponse.json({ ok: true });
  const owner = gig.ownerEmail ?? config.superAdminEmail;
  if (owner !== session.email) {
    return NextResponse.json({ error: "Not your link" }, { status: 403 });
  }

  // Deleting a gig revokes its link: the page 404s and the unlock key no longer
  // resolves to anything.
  await deleteGig(token);
  return NextResponse.json({ ok: true });
}
