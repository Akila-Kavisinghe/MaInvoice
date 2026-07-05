import { NextResponse } from "next/server";
import { syncUser } from "@/lib/sync-auth";
import { deletePendingInvoice, getPendingInvoice } from "@/lib/store";
import { syncAckSchema } from "@/lib/validation";
import { clientIp, rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

/**
 * The local app confirms invoices were written to its folder; the server then
 * drops the retained PDFs. Only ids owned by the token's user are deleted.
 */
export async function POST(req: Request) {
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

  const parsed = syncAckSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  let deleted = 0;
  for (const id of parsed.data.ids) {
    const pending = await getPendingInvoice(id);
    if (pending && pending.ownerEmail === email) {
      await deletePendingInvoice(id);
      deleted++;
    }
  }
  return NextResponse.json({ deleted });
}
