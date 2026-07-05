import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/auth";
import { localModeUnavailable } from "@/lib/local-mode";
import { hasInvoiceDir } from "@/lib/library";
import { deleteContact, listContacts, saveContact } from "@/lib/contacts";
import { contactSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET() {
  const gate = localModeUnavailable();
  if (gate) return gate;
  if (!hasInvoiceDir()) return NextResponse.json({ contacts: [] });
  return NextResponse.json({ contacts: await listContacts() });
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

  const parsed = contactSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
  }
  return NextResponse.json({ contact: await saveContact(parsed.data) });
}

export async function DELETE(req: Request) {
  const gate = localModeUnavailable();
  if (gate) return gate;
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  }
  const email = new URL(req.url).searchParams.get("email");
  if (!email) {
    return NextResponse.json({ error: "Missing email" }, { status: 400 });
  }
  await deleteContact(email);
  return NextResponse.json({ ok: true });
}
