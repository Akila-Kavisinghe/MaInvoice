"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Banner, Card } from "@/components/ui";
import { formatDate } from "@/lib/format";
import {
  LinkActions,
  SubmissionsTable,
  type LinkRow,
} from "@/app/admin/components";

/**
 * Read-only view of the links living on the server and who has submitted.
 * Nothing here deletes anything — links and submission history persist on the
 * server (Redis) regardless of local syncing.
 */
export default function LinksView() {
  const [links, setLinks] = useState<LinkRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [hideAmounts, setHideAmounts] = useState(false);

  useEffect(() => {
    fetch("/api/local/settings")
      .then((r) => r.json())
      .then((d) => setHideAmounts(!!d.hideAmounts))
      .catch(() => {});
  }, []);

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
          and send it to whoever is invoicing you.
        </Card>
      ) : null}

      <LinkSections
        links={links ?? []}
        copied={copied}
        onCopy={copy}
        onChanged={load}
        hideAmounts={hideAmounts}
      />
    </>
  );
}

function LinkSections({
  links,
  copied,
  onCopy,
  onChanged,
  hideAmounts,
}: {
  links: LinkRow[];
  copied: string | null;
  onCopy: (url: string) => void;
  onChanged: () => void;
  hideAmounts: boolean;
}) {
  const active = links.filter((l) => !l.archivedAt);
  const archived = links.filter((l) => l.archivedAt);

  async function setArchived(token: string, archivedFlag: boolean) {
    await fetch("/api/local/links", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, archived: archivedFlag }),
    });
    onChanged();
  }

  async function deleteForever(token: string) {
    await fetch(`/api/local/links?token=${encodeURIComponent(token)}`, {
      method: "DELETE",
    });
    onChanged();
  }

  const row = (l: LinkRow) => (
    <Card key={l.token} className={`p-4 ${l.archivedAt ? "opacity-75" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-800">
            {l.eventName}
            {l.archivedAt ? (
              <span className="ml-2 rounded bg-elev px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide text-dim">
                Archived
              </span>
            ) : null}
          </p>
          <p className="text-xs text-slate-500">
            {formatDate(l.eventDate)}
            {l.archivedAt ? ` · revoked ${formatDate(l.archivedAt.slice(0, 10))}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!l.archivedAt ? (
            <button
              type="button"
              onClick={() => onCopy(l.url)}
              className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-accent hover:bg-elev"
            >
              {copied === l.url ? "Copied" : "Copy link"}
            </button>
          ) : null}
          <LinkActions
            link={l}
            onArchive={() => setArchived(l.token, true)}
            onRestore={() => setArchived(l.token, false)}
            onDeleteForever={() => deleteForever(l.token)}
          />
        </div>
      </div>

      <SubmissionsTable
        submissions={l.submissions}
        hideAmounts={hideAmounts}
        onDelete={async (s) => {
          await fetch(
            `/api/local/submissions?token=${encodeURIComponent(l.token)}&email=${encodeURIComponent(s.bandmateEmail)}`,
            { method: "DELETE" },
          );
          onChanged();
        }}
      />
    </Card>
  );

  return (
    <>
      {active.length > 0 ? (
        <div className="mt-6 space-y-3">{active.map(row)}</div>
      ) : null}
      {archived.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Archived
          </h2>
          <div className="space-y-3">{archived.map(row)}</div>
        </section>
      ) : null}
    </>
  );
}
