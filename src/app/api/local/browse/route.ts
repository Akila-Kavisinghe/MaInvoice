import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { localModeUnavailable } from "@/lib/local-mode";
import { expandHome } from "@/lib/local-settings";

export const runtime = "nodejs";

/**
 * Minimal directory browser backing the in-app folder picker. Local mode only
 * (loopback-bound, single-user machine), read-only: lists subfolders of the
 * requested directory, defaulting to the user's home folder.
 */
export async function GET(req: Request) {
  const gate = localModeUnavailable();
  if (gate) return gate;

  const raw = new URL(req.url).searchParams.get("path")?.trim();
  const dir = path.resolve(expandHome(raw || os.homedir()));

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return NextResponse.json(
      { error: "Can't open that folder" },
      { status: 400 },
    );
  }

  const dirs = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));

  const parent = path.dirname(dir);
  return NextResponse.json({
    path: dir,
    parent: parent === dir ? null : parent, // null at the filesystem root
    home: os.homedir(),
    dirs,
  });
}
