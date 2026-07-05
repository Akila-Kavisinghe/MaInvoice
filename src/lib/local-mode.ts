import { NextResponse } from "next/server";
import { config } from "./config";

/**
 * Hard gate for /api/local/* routes: they operate on the local filesystem and
 * must never be reachable on the deployed server. Returns a 404 response to
 * send back, or null when local mode is active.
 */
export function localModeUnavailable(): NextResponse | null {
  if (config.localMode && !process.env.VERCEL) return null;
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
