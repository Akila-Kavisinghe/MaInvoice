"use client";

import { useState } from "react";
import { Card } from "@/components/ui";
import type { Contact, LibraryEntry } from "./lib-types";

/** Contact cards for everyone you've invoiced or been invoiced by. */
export default function ContactsCard({
  contacts,
  invoices,
  activeEmail,
  onFilter,
  onChanged,
}: {
  contacts: Contact[];
  invoices: LibraryEntry[];
  activeEmail: string | null;
  onFilter: (email: string | null) => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  if (contacts.length === 0) return null;

  const counts = new Map<string, number>();
  for (const inv of invoices) {
    if (inv.contactEmail) {
      counts.set(inv.contactEmail, (counts.get(inv.contactEmail) ?? 0) + 1);
    }
  }

  async function remove(email: string) {
    if (!window.confirm(`Remove the contact card for ${email}? Their invoices stay.`)) {
      return;
    }
    setBusy(email);
    try {
      const res = await fetch(`/api/local/contacts?email=${encodeURIComponent(email)}`, {
        method: "DELETE",
      });
      if (res.ok) onChanged();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="mt-8 p-5">
      <h2 className="text-lg font-semibold text-ink">Contacts</h2>
      <p className="mt-1 text-sm text-dim">
        Created automatically from the invoices you receive and send. Click one
        to filter the library.
      </p>
      <ul className="mt-3 space-y-1">
        {contacts.map((c) => {
          const active = activeEmail === c.email;
          return (
            <li key={c.email} className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => onFilter(active ? null : c.email)}
                className={`min-w-0 flex-1 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-elev ${
                  active ? "bg-accent/10 text-accent" : "text-slate-700"
                }`}
              >
                <span className="font-medium">{c.name}</span>
                <span className="ml-2 truncate text-xs text-slate-400">{c.email}</span>
                <span className="ml-2 text-xs text-slate-400">
                  · {counts.get(c.email) ?? 0} invoice{(counts.get(c.email) ?? 0) === 1 ? "" : "s"}
                </span>
              </button>
              <button
                type="button"
                onClick={() => remove(c.email)}
                disabled={busy === c.email}
                className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
