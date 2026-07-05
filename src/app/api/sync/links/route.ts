import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createUnlockKey } from "@/lib/auth";
import { syncUser } from "@/lib/sync-auth";
import { config } from "@/lib/config";
import { listGigs, saveGig } from "@/lib/store";
import { gigCreateSchema } from "@/lib/validation";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import type { Gig } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Invoice-link management over the sync (Bearer) API, so the local desktop
 * app can create and list links without a browser session. Same ownership
 * model as /api/admin/links — the token resolves to a user and everything is
 * scoped to them.
 */

async function guard(req: Request) {
  const limit = await rateLimit(`sync:${clientIp(req.headers)}`, 60, 5 * 60 * 1000);
  if (!limit.allowed) {
    return {
      error: NextResponse.json(
        { error: `Too many requests. Try again in ${limit.retryAfterSeconds}s.` },
        { status: 429 },
      ),
    };
  }
  const email = await syncUser(req);
  if (!email) {
    return { error: NextResponse.json({ error: "Not authorized" }, { status: 401 }) };
  }
  return { email };
}

export async function GET(req: Request) {
  const { email, error } = await guard(req);
  if (!email) return error;

  const gigs = await listGigs(email);
  const baseUrl = config.baseUrl;
  return NextResponse.json({
    links: gigs.map((g) => ({
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
  const { email, error } = await guard(req);
  if (!email) return error;

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
    ownerEmail: email,
    ...parsed.data,
  };
  await saveGig(gig);

  return NextResponse.json({
    token,
    url: `${config.baseUrl}/i/${token}?k=${createUnlockKey(token)}`,
  });
}
