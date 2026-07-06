import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/auth";
import { localModeUnavailable } from "@/lib/local-mode";
import { hasInvoiceDir } from "@/lib/library";
import { deleteCategoryTag, listCategoryTags, saveCategoryTag } from "@/lib/tags";
import { categoryTagSchema } from "@/lib/validation";

export const runtime = "nodejs";

/** Custom category tag definitions (name → T2125 category). */
export async function GET() {
  const gate = localModeUnavailable();
  if (gate) return gate;
  if (!hasInvoiceDir()) return NextResponse.json({ tags: [] });
  return NextResponse.json({ tags: await listCategoryTags() });
}

export async function POST(req: Request) {
  const gate = localModeUnavailable();
  if (gate) return gate;
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  }
  if (!hasInvoiceDir()) {
    return NextResponse.json({ error: "Choose an invoice folder first" }, { status: 400 });
  }

  const parsed = categoryTagSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Give the tag a name and a T2125 category" },
      { status: 400 },
    );
  }
  return NextResponse.json({
    tag: await saveCategoryTag(parsed.data.name, parsed.data.taxCategory),
  });
}

export async function DELETE(req: Request) {
  const gate = localModeUnavailable();
  if (gate) return gate;
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  }
  const name = new URL(req.url).searchParams.get("name");
  if (!name) {
    return NextResponse.json({ error: "Missing name" }, { status: 400 });
  }
  await deleteCategoryTag(name);
  return NextResponse.json({ ok: true });
}
