import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/auth";
import { localModeUnavailable } from "@/lib/local-mode";
import { resolveRemoteSync } from "@/lib/local-settings";
import { addInvoice, hasInvoiceDir } from "@/lib/library";
import type { PendingInvoiceMeta } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Pull pending invoices from the deployed server into the local folder.
 * Runs server-side in the local app so the sync token never reaches a browser.
 *
 * Ordering matters: each PDF is written to disk BEFORE its id is acked, so a
 * crash mid-sync can duplicate a file at worst — never lose one.
 */
export async function POST(req: Request) {
  const gate = localModeUnavailable();
  if (gate) return gate;
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  }
  if (!hasInvoiceDir()) {
    return NextResponse.json({ error: "Choose an invoice folder first" }, { status: 400 });
  }
  const remote = resolveRemoteSync();
  if (!remote) {
    return NextResponse.json(
      { error: "Set your server URL and sync token in Settings first" },
      { status: 400 },
    );
  }

  const { url, token } = remote;
  const auth = { Authorization: `Bearer ${token}` };

  const listRes = await fetch(`${url}/api/sync/pending`, {
    headers: auth,
    cache: "no-store",
  }).catch(() => null);
  if (!listRes?.ok) {
    return NextResponse.json(
      {
        error:
          listRes?.status === 401
            ? "The server rejected your sync token. Generate a new one on the website."
            : "Could not reach the server. Check REMOTE_SYNC_URL and your connection.",
      },
      { status: 502 },
    );
  }
  const { pending } = (await listRes.json()) as { pending: PendingInvoiceMeta[] };

  const written: string[] = [];
  const errors: string[] = [];
  for (const meta of pending) {
    try {
      const pdfRes = await fetch(`${url}/api/sync/pending/${meta.id}`, {
        headers: auth,
        cache: "no-store",
      });
      if (!pdfRes.ok) throw new Error(`download failed (${pdfRes.status})`);
      const pdf = Buffer.from(await pdfRes.arrayBuffer());

      await addInvoice(pdf, meta.filename, "sync", {
        eventName: meta.eventName,
        eventDate: meta.eventDate,
        bandmateName: meta.bandmateName,
        invoiceNumber: meta.invoiceNumber,
        amount: meta.amount,
      });
      written.push(meta.id);
    } catch (err) {
      console.error("sync pull failed for", meta.id, err);
      errors.push(`${meta.filename}: ${err instanceof Error ? err.message : "failed"}`);
    }
  }

  // Ack only what actually landed on disk; the server deletes those PDFs.
  if (written.length) {
    const ackRes = await fetch(`${url}/api/sync/ack`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ ids: written }),
    }).catch(() => null);
    if (!ackRes?.ok) {
      errors.push(
        "Invoices were saved, but the server wasn't told — they may download again next sync.",
      );
    }
  }

  return NextResponse.json({ pulled: written.length, errors });
}
