import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/auth";
import { localModeUnavailable } from "@/lib/local-mode";
import { hasInvoiceDir, indexFile } from "@/lib/library";
import { indexFileSchema } from "@/lib/validation";

export const runtime = "nodejs";

/** Adopt a PDF already sitting in the invoice folder into the manifest. */
export async function POST(req: Request) {
  const gate = localModeUnavailable();
  if (gate) return gate;
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  }
  if (!hasInvoiceDir()) {
    return NextResponse.json({ error: "Choose an invoice folder first" }, { status: 400 });
  }

  const parsed = indexFileSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { relPath, ...meta } = parsed.data;
  try {
    const entry = await indexFile(relPath, meta);
    return NextResponse.json({ entry });
  } catch {
    // Missing file or a path that tries to escape the folder.
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
