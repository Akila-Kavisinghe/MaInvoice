import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createUnlockKey, hasValidSession, sameOrigin } from "@/lib/auth";
import { config } from "@/lib/config";
import { deleteGig, listGigs, saveGig } from "@/lib/store";
import { gigCreateSchema } from "@/lib/validation";
import type { Gig } from "@/lib/types";

export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ error: "Not authorized" }, { status: 401 });
}

export async function GET() {
  if (!(await hasValidSession("admin"))) return unauthorized();
  const gigs = await listGigs();
  const baseUrl = config.baseUrl;
  return NextResponse.json({
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
  if (!(await hasValidSession("admin"))) return unauthorized();

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
  if (!(await hasValidSession("admin"))) return unauthorized();

  const token = new URL(req.url).searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  // Deleting a gig revokes its link: the page 404s and the unlock key no longer
  // resolves to anything.
  await deleteGig(token);
  return NextResponse.json({ ok: true });
}
