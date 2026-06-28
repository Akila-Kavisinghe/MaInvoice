import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import {
  createSessionValue,
  cookieName,
  passwordMatches,
  sessionCookieOptions,
} from "@/lib/auth";
import { clientIp, clearRateLimit, rateLimit } from "@/lib/ratelimit";
import { passwordSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  const limit = rateLimit(`admin-login:${ip}`, 5, 5 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${limit.retryAfterSeconds}s.` },
      { status: 429 },
    );
  }

  const parsed = passwordSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Password required" }, { status: 400 });
  }

  if (!passwordMatches(parsed.data.password, config.adminPassword)) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  clearRateLimit(`admin-login:${ip}`);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(cookieName("admin"), createSessionValue("admin"), sessionCookieOptions);
  return res;
}
