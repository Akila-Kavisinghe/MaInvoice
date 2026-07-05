"use client";

import Link from "next/link";
import { Card } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { useAdmin } from "./AdminShell";
import { CopyField, RevokeButton, SubmissionsTable } from "./components";

/** Your invoice links and who has submitted on each. */
export default function AdminLinksPage() {
  const { data, reload } = useAdmin();

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
        Send a link to a bandmate; their submissions appear under it.
      </p>

      {data.gigs.length === 0 ? (
        <Card className="mt-6 p-6 text-sm text-dim">
          No links yet —{" "}
          <Link href="/admin/create" className="font-medium text-accent">
            create your first invoice link
          </Link>
          .
        </Card>
      ) : (
        <div className="mt-6 space-y-3">
          {data.gigs.map((l) => (
            <Card key={l.token} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-800">{l.eventName}</p>
                  <p className="text-xs text-slate-500">{formatDate(l.eventDate)}</p>
                </div>
                <RevokeButton token={l.token} eventName={l.eventName} onRevoked={reload} />
              </div>
              <CopyField value={l.url} compact />
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
          ))}
        </div>
      )}
    </>
  );
}
