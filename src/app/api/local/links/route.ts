import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/auth";
import { localModeUnavailable } from "@/lib/local-mode";
import { resolveRemoteSync } from "@/lib/local-settings";

export const runtime = "nodejs";

/**
 * Proxy for invoice-link creation/listing from the local app: forwards to the
 * deployed server's /api/sync/links with the sync token, so the token never
 * reaches the browser.
 */

function notConfigured() {
  return NextResponse.json(
    { error: "Set your server URL and sync token in Settings first" },
    { status: 400 },
  );
}

export async function GET() {
  const gate = localModeUnavailable();
  if (gate) return gate;
  const remote = resolveRemoteSync();
  if (!remote) return notConfigured();

  const res = await fetch(`${remote.url}/api/sync/links`, {
    headers: { Authorization: `Bearer ${remote.token}` },
    cache: "no-store",
  }).catch(() => null);
  if (!res) {
    return NextResponse.json({ error: "Could not reach the server" }, { status: 502 });
  }
  return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
}

export async function POST(req: Request) {
  const gate = localModeUnavailable();
  if (gate) return gate;
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  }
  const remote = resolveRemoteSync();
  if (!remote) return notConfigured();

  const body = await req.text();
  const res = await fetch(`${remote.url}/api/sync/links`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${remote.token}`,
      "Content-Type": "application/json",
    },
    body,
  }).catch(() => null);
  if (!res) {
    return NextResponse.json({ error: "Could not reach the server" }, { status: 502 });
  }
  return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
}
