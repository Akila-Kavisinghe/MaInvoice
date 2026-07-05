import { NextResponse } from "next/server";
import { localModeUnavailable } from "@/lib/local-mode";
import { resolveRemoteSync } from "@/lib/local-settings";

export const runtime = "nodejs";

/**
 * Is this app authorized to be used? Validates the stored sync token against
 * the server. Results:
 *   unconfigured — no server/token saved yet
 *   authorized   — token valid (owner is on the allowlist)
 *   unauthorized — server rejected the token (revoked / user removed)
 *   offline      — server unreachable or too old to say; don't lock the user
 *                  out of their own files over a network blip
 *
 * Cached for 5 minutes so page navigation doesn't hammer the server.
 */

let cache: { status: string; email?: string; at: number } | null = null;
const CACHE_MS = 5 * 60 * 1000;

export async function GET(req: Request) {
  const gate = localModeUnavailable();
  if (gate) return gate;

  const force = new URL(req.url).searchParams.get("force") === "1";
  if (!force && cache && Date.now() - cache.at < CACHE_MS) {
    return NextResponse.json(cache);
  }

  const remote = resolveRemoteSync();
  if (!remote) {
    cache = { status: "unconfigured", at: Date.now() };
    return NextResponse.json(cache);
  }

  try {
    const res = await fetch(`${remote.url}/api/sync/me`, {
      headers: { Authorization: `Bearer ${remote.token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = (await res.json()) as { email?: string };
      cache = { status: "authorized", email: data.email, at: Date.now() };
    } else if (res.status === 401) {
      cache = { status: "unauthorized", at: Date.now() };
    } else {
      // Older server without /api/sync/me (404) or a 5xx — can't verify.
      cache = { status: "offline", at: Date.now() };
    }
  } catch {
    cache = { status: "offline", at: Date.now() };
  }
  return NextResponse.json(cache);
}
