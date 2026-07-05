"use client";

import Link from "next/link";
import { Card } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { useAdmin } from "./AdminShell";
import {
  CopyField,
  LinkActions,
  SubmissionsTable,
  type LinkRow,
} from "./components";

/** Your invoice links (active + archived) and who has submitted on each. */
export default function AdminLinksPage() {
  const { data, reload } = useAdmin();

  const active = data.gigs.filter((g) => !g.archivedAt);
  const archived = data.gigs.filter((g) => g.archivedAt);

  async function setArchived(token: string, archivedFlag: boolean) {
    await fetch("/api/admin/links", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, archived: archivedFlag }),
    });
    reload();
  }

  async function deleteForever(token: string) {
    await fetch(`/api/admin/links?token=${encodeURIComponent(token)}`, {
      method: "DELETE",
    });
    reload();
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
        <LinkActions
          link={l}
          onArchive={() => setArchived(l.token, true)}
          onRestore={() => setArchived(l.token, false)}
          onDeleteForever={() => deleteForever(l.token)}
        />
      </div>
      {!l.archivedAt ? <CopyField value={l.url} compact /> : null}
      <SubmissionsTable
        submissions={l.submissions}
        onDelete={async (s) => {
          await fetch(
            `/api/admin/submissions?token=${encodeURIComponent(l.token)}&email=${encodeURIComponent(s.bandmateEmail)}`,
            { method: "DELETE" },
          );
          reload();
        }}
      />
    </Card>
  );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-ink">Invoice links</h1>
        <Link
          href="/admin/create"
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-accent hover:bg-elev"
        >
          + New link
        </Link>
      </div>
      <p className="mt-1 text-sm text-dim">
        Send a link to a bandmate; their submissions appear under it. Revoking
        archives a link — it can be restored later.
      </p>

      {active.length === 0 && archived.length === 0 ? (
        <Card className="mt-6 p-6 text-sm text-dim">
          No links yet —{" "}
          <Link href="/admin/create" className="font-medium text-accent">
            create your first invoice link
          </Link>
          .
        </Card>
      ) : null}

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
