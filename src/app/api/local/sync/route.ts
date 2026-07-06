import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/auth";
import { localModeUnavailable } from "@/lib/local-mode";
import { resolveRemoteSync } from "@/lib/local-settings";
import {
  addInvoice,
  clearServerCopy,
  getInvoiceFile,
  hasInvoiceDir,
  listInvoices,
} from "@/lib/library";
import { upsertContact } from "@/lib/contacts";
import type { PendingInvoiceMeta } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Pull pending invoices from the deployed server into the local folder.
 * Runs server-side in the local app so the sync token never reaches a browser.
 *
 * Loss-proof ordering, in this exact sequence:
 *   1. download → 2. write to disk → 3. RE-READ the file to verify it →
 *   4. only then ack, which is when the server deletes its copy.
 * A failure or crash anywhere before step 4 leaves the server copy intact
 * (90-day TTL backstop). If the ack itself fails, the pending id recorded on
 * each entry both prevents duplicate re-downloads AND queues an automatic
 * ack retry on the next sync.
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

  // Entries whose ack failed on a previous sync still carry a pendingId —
  // they're skipped for download (no duplicates) and re-acked below.
  const lingering = (await listInvoices()).filter((e) => e.pendingId);
  const alreadySynced = new Set(lingering.map((e) => e.pendingId));

  const errors: string[] = [];
  // Local entry id + server pending id for everything eligible to ack.
  const ackCandidates: { entryId: string; pendingId: string }[] = lingering.map(
    (e) => ({ entryId: e.id, pendingId: e.pendingId! }),
  );

  let pulled = 0;
  for (const meta of pending) {
    if (alreadySynced.has(meta.id)) continue;
    try {
      const pdfRes = await fetch(`${url}/api/sync/pending/${meta.id}`, {
        headers: auth,
        cache: "no-store",
      });
      if (!pdfRes.ok) throw new Error(`download failed (${pdfRes.status})`);
      const pdf = Buffer.from(await pdfRes.arrayBuffer());

      const entry = await addInvoice(pdf, meta.filename, "sync", "inbound", {
        eventName: meta.eventName,
        eventDate: meta.eventDate,
        bandmateName: meta.bandmateName,
        invoiceNumber: meta.invoiceNumber,
        amount: meta.amount,
        contactEmail: meta.bandmateEmail,
        contactName: meta.bandmateName,
        pendingId: meta.id,
      });
      // New sender → contact card appears automatically.
      if (meta.bandmateEmail) {
        try {
          await upsertContact({ email: meta.bandmateEmail, name: meta.bandmateName });
        } catch (err) {
          console.error("contact upsert failed for", meta.id, err);
        }
      }
      pulled++;
      ackCandidates.push({ entryId: entry.id, pendingId: meta.id });
    } catch (err) {
      console.error("sync pull failed for", meta.id, err);
      errors.push(`${meta.filename}: ${err instanceof Error ? err.message : "failed"}`);
    }
  }

  // Ack (which deletes the server copy) ONLY for files verified readable on
  // disk right now — a re-read, not trust in the earlier write.
  const verified: { entryId: string; pendingId: string }[] = [];
  for (const c of ackCandidates) {
    const onDisk = await getInvoiceFile(c.entryId);
    if (onDisk && onDisk.pdf.length > 0) verified.push(c);
  }

  if (verified.length) {
    const ackRes = await fetch(`${url}/api/sync/ack`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ ids: verified.map((c) => c.pendingId) }),
    }).catch(() => null);
    if (ackRes?.ok) {
      for (const c of verified) await clearServerCopy(c.entryId);
    } else {
      // Nothing lost: files are on disk, server copies remain, and this same
      // block retries automatically on the next sync (no re-download).
      errors.push(
        "Invoices are saved locally; server cleanup didn't go through and will retry on the next sync.",
      );
    }
  }

  return NextResponse.json({ pulled, errors });
}
