import { NextResponse } from "next/server";
import { syncUser } from "@/lib/sync-auth";
import { listPendingInvoices } from "@/lib/store";
import { clientIp, rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

/** List invoices awaiting download by the token owner's local app. No PDF bytes. */
export async function GET(req: Request) {
  const limit = await rateLimit(`sync:${clientIp(req.headers)}`, 60, 5 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Too many requests. Try again in ${limit.retryAfterSeconds}s.` },
      { status: 429 },
    );
  }

  const email = await syncUser(req);
  if (!email) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  return NextResponse.json({ pending: await listPendingInvoices(email) });
}
