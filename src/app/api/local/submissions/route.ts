import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/auth";
import { localModeUnavailable } from "@/lib/local-mode";
import { resolveRemoteSync } from "@/lib/local-settings";

export const runtime = "nodejs";

/** Proxy: delete a submission record on the server from the local app. */
export async function DELETE(req: Request) {
  const gate = localModeUnavailable();
  if (gate) return gate;
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  }
  const remote = resolveRemoteSync();
  if (!remote) {
    return NextResponse.json(
      { error: "Set your server URL and sync token in Settings first" },
      { status: 400 },
    );
  }

  const params = new URL(req.url).searchParams;
  const res = await fetch(
    `${remote.url}/api/sync/submissions?${params.toString()}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${remote.token}` },
    },
  ).catch(() => null);
  if (!res) {
    return NextResponse.json({ error: "Could not reach the server" }, { status: 502 });
  }
  return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
}
