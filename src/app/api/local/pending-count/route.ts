import { NextResponse } from "next/server";
import { localModeUnavailable } from "@/lib/local-mode";
import { resolveRemoteSync } from "@/lib/local-settings";
import type { PendingInvoiceMeta } from "@/lib/types";

export const runtime = "nodejs";

/**
 * How many invoices are waiting on the server to be pulled — metadata only, no
 * PDF bytes. Powers the sync badge in the header. Strictly read-only: it never
 * writes to disk or acks anything (that's POST /api/local/sync's job), so
 * checking the badge is not "syncing".
 */
export async function GET() {
  const gate = localModeUnavailable();
  if (gate) return gate;

  const remote = resolveRemoteSync();
  if (!remote) return NextResponse.json({ configured: false, count: 0 });

  const { url, token } = remote;
  const res = await fetch(`${url}/api/sync/pending`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  }).catch(() => null);

  // Unreachable server / bad token: report configured-but-unknown as 0 rather
  // than erroring — the badge just stays empty until the next check.
  if (!res?.ok) return NextResponse.json({ configured: true, count: 0 });

  const { pending } = (await res.json()) as { pending: PendingInvoiceMeta[] };
  return NextResponse.json({ configured: true, count: pending.length });
}
