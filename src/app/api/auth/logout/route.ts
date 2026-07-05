import { NextResponse } from "next/server";
import { cookieName, sameOrigin } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(cookieName("user"), "", { path: "/", maxAge: 0 });
  return res;
}
