import { NextResponse } from "next/server";
import { syncUser } from "@/lib/sync-auth";
import { getPendingInvoice } from "@/lib/store";
import { clientIp, rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

/** Download one pending invoice PDF. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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

  const { id } = await params;
  const pending = await getPendingInvoice(id);
  // 404 (not 403) for foreign ids so this endpoint never confirms they exist.
  if (!pending || pending.ownerEmail !== email) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(Buffer.from(pending.pdfBase64, "base64")), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pending.filename.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(pending.filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
