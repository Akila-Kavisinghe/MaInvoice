import { NextResponse } from "next/server";
import { requireUser, sameOrigin } from "@/lib/auth";
import { config } from "@/lib/config";
import {
  addAllowedUser,
  listAllowedUsers,
  removeAllowedUser,
  revokeSyncToken,
} from "@/lib/store";
import { allowedEmailSchema } from "@/lib/validation";

export const runtime = "nodejs";

/** Super-admin-only management of who may sign in with Google. */
async function requireSuperAdmin() {
  const session = await requireUser();
  if (!session) {
    return { error: NextResponse.json({ error: "Not authorized" }, { status: 401 }) };
  }
  if (!session.isSuperAdmin) {
    return { error: NextResponse.json({ error: "Super admin only" }, { status: 403 }) };
  }
  return { session };
}

export async function GET() {
  const { session, error } = await requireSuperAdmin();
  if (!session) return error;
  return NextResponse.json({ users: await listAllowedUsers() });
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  }
  const { session, error } = await requireSuperAdmin();
  if (!session) return error;

  const parsed = allowedEmailSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
  }
  const email = parsed.data.email;
  if (email === config.superAdminEmail) {
    return NextResponse.json(
      { error: "You are always allowed — no need to add yourself" },
      { status: 400 },
    );
  }

  await addAllowedUser({
    email,
    addedAt: new Date().toISOString(),
    addedBy: session.email,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  }
  const { session, error } = await requireSuperAdmin();
  if (!session) return error;

  const raw = new URL(req.url).searchParams.get("email");
  const parsed = allowedEmailSchema.safeParse({ email: raw ?? "" });
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing email" }, { status: 400 });
  }

  // Kill their sync access too, so a removed user's local app stops pulling.
  await removeAllowedUser(parsed.data.email);
  await revokeSyncToken(parsed.data.email);
  return NextResponse.json({ ok: true });
}
