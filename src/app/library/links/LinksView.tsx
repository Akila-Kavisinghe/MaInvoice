"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Banner, Card } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";

interface Submission {
  bandmateName: string;
  bandmateEmail: string;
  invoiceNumber: string;
  amount: number;
  submittedAt: string;
}

interface LinkRow {
  token: string;
  eventName: string;
  eventDate: string;
  createdAt: string;
  url: string;
  submissions: Submission[];
}

/**
 * Read-only view of the links living on the server and who has submitted.
 * Nothing here deletes anything — links and submission history persist on the
 * server (Redis) regardless of local syncing.
 */
export default function LinksView() {
  const [links, setLinks] = useState<LinkRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/local/links")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) {
          setError(d.error ?? "Couldn't load links from the server");
          return;
        }
        setError(null);
        setLinks(d.links ?? []);
      })
      .catch(() => setError("Couldn't reach the server"));
  }, []);

  useEffect(load, [load]);

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard may be unavailable */
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-ink">Invoice links</h1>
        <Link
          href="/library/create"
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-accent hover:bg-elev"
        >
          + New link
        </Link>
      </div>
      <p className="mt-1 text-sm text-dim">
        Live from your server — these links (and every submission on them) stay
        stored there; syncing invoices into this library never removes them.
      </p>

      {error ? (
        <div className="mt-4">
          <Banner tone="error">{error}</Banner>
        </div>
      ) : null}

      {links === null && !error ? (
        <p className="mt-8 text-center text-sm text-slate-400">Loading…</p>
      ) : null}

      {links && links.length === 0 ? (
        <Card className="mt-6 p-6 text-sm text-dim">
          No links yet —{" "}
          <Link href="/library/create" className="font-medium text-accent">
            create one
          </Link>{" "}
          and send it to a bandmate.
        </Card>
      ) : null}

      <div className="mt-6 space-y-3">
        {(links ?? []).map((l) => (
          <Card key={l.token} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-800">{l.eventName}</p>
                <p className="text-xs text-slate-500">{formatDate(l.eventDate)}</p>
              </div>
              <button
                type="button"
                onClick={() => copy(l.url)}
                className="shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-medium text-accent hover:bg-elev"
              >
                {copied === l.url ? "Copied" : "Copy link"}
              </button>
            </div>

            <div className="mt-3 border-t border-slate-100 pt-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Submitted ({l.submissions.length})
              </p>
              {l.submissions.length === 0 ? (
                <p className="text-sm text-slate-400">No submissions yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="text-xs uppercase tracking-wide text-slate-400">
                        <th className="pb-1 pr-3 font-medium">Bandmate</th>
                        <th className="pb-1 pr-3 font-medium">Invoice #</th>
                        <th className="pb-1 pr-3 text-right font-medium">Amount</th>
                        <th className="pb-1 font-medium">When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {l.submissions.map((s, i) => (
                        <tr key={i} className="border-t border-slate-100 align-top">
                          <td className="py-1.5 pr-3">
                            <div className="font-medium text-slate-800">{s.bandmateName}</div>
                            <div className="truncate text-xs text-slate-400">{s.bandmateEmail}</div>
                          </td>
                          <td className="py-1.5 pr-3 text-slate-600">{s.invoiceNumber}</td>
                          <td className="py-1.5 pr-3 text-right text-slate-800">
                            {formatMoney(s.amount)}
                          </td>
                          <td className="py-1.5 text-xs text-slate-500">
                            {new Date(s.submittedAt).toLocaleDateString("en-CA", {
                              month: "short",
                              day: "numeric",
                            })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-slate-200">
                        <td className="pt-1.5 text-xs font-semibold text-slate-500" colSpan={2}>
                          Total
                        </td>
                        <td className="pt-1.5 text-right text-sm font-semibold text-slate-800">
                          {formatMoney(l.submissions.reduce((sum, s) => sum + s.amount, 0))}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
