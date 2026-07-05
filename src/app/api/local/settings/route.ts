import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/auth";
import { localModeUnavailable } from "@/lib/local-mode";
import {
  expandHome,
  resolveInvoiceDir,
  resolveRemoteSync,
  saveInvoiceDir,
  saveRemoteSync,
} from "@/lib/local-settings";
import { z } from "zod";

export const runtime = "nodejs";

const settingsSchema = z
  .object({
    path: z.string().trim().min(1).max(1000).optional(),
    remoteUrl: z.string().trim().url("Enter a valid URL").max(500).optional(),
    remoteToken: z
      .string()
      .trim()
      .regex(/^mis_[\w-]+$/, "That doesn't look like a sync token (mis_…)")
      .max(200)
      .optional(),
  })
  .refine((d) => d.path || (d.remoteUrl && d.remoteToken), {
    message: "Nothing to save",
  })
  .refine((d) => !!d.remoteUrl === !!d.remoteToken, {
    message: "Enter both the server URL and the sync token",
  });

export async function GET() {
  const gate = localModeUnavailable();
  if (gate) return gate;
  const remote = resolveRemoteSync();
  return NextResponse.json({
    invoiceDir: resolveInvoiceDir(),
    // Never return the token itself — the UI only needs to know it's set.
    remoteUrl: remote?.url ?? null,
    remoteConfigured: remote !== null,
  });
}

/** Save the invoice folder and/or the server connection from the app. */
export async function POST(req: Request) {
  const gate = localModeUnavailable();
  if (gate) return gate;
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  }

  const parsed = settingsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  if (parsed.data.path) {
    const dir = path.resolve(expandHome(parsed.data.path));
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
      if (!fs.statSync(dir).isDirectory()) {
        return NextResponse.json(
          { error: "That path is a file, not a folder" },
          { status: 400 },
        );
      }
    } catch {
      return NextResponse.json(
        { error: "Couldn't create or write to that folder — check the path and permissions" },
        { status: 400 },
      );
    }
    saveInvoiceDir(dir);
  }

  if (parsed.data.remoteUrl && parsed.data.remoteToken) {
    saveRemoteSync(parsed.data.remoteUrl, parsed.data.remoteToken);
  }

  const remote = resolveRemoteSync();
  return NextResponse.json({
    invoiceDir: resolveInvoiceDir(),
    remoteUrl: remote?.url ?? null,
    remoteConfigured: remote !== null,
  });
}
