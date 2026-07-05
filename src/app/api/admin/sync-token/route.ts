import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { hashSyncToken, requireUser, sameOrigin } from "@/lib/auth";
import { hasSyncToken, revokeSyncToken, setSyncToken } from "@/lib/store";

export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ error: "Not authorized" }, { status: 401 });
}

export async function GET() {
  const session = await requireUser();
  if (!session) return unauthorized();
  return NextResponse.json({ exists: await hasSyncToken(session.email) });
}

/**
 * Mint a personal sync token for the local library app. The plaintext is
 * returned exactly once; only its SHA-256 is stored. Generating a new token
 * replaces (revokes) the previous one.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  }
  const session = await requireUser();
  if (!session) return unauthorized();

  const token = `mis_${crypto.randomBytes(32).toString("base64url")}`;
  await setSyncToken(session.email, hashSyncToken(token));
  return NextResponse.json({ token });
}

export async function DELETE(req: Request) {
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  }
  const session = await requireUser();
  if (!session) return unauthorized();

  await revokeSyncToken(session.email);
  return NextResponse.json({ ok: true });
}
