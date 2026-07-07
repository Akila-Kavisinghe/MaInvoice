"use client";

import { useState } from "react";
import { displayMoney } from "@/lib/format";

/** Shared bits for the admin pages. */

export interface UserInfo {
  email: string;
  name: string;
  isSuperAdmin: boolean;
  hasSyncToken: boolean;
}

export interface Submission {
  bandmateName: string;
  bandmateEmail: string;
  invoiceNumber: string;
  amount: number;
  submittedAt: string;
}

export interface LinkRow {
  token: string;
  eventName: string;
  eventDate: string;
  createdAt: string;
  archivedAt: string | null;
  url: string;
  submissions: Submission[];
}

export interface BusinessDefaults {
  name: string;
  contact: string;
  address: string;
  phone: string;
  email: string;
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
      {children}
    </h3>
  );
}

export function CopyField({ value, compact }: { value: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be unavailable */
    }
  }
  return (
    <div className={`flex items-center gap-2 ${compact ? "mt-2" : "mt-3"}`}>
      <input
        readOnly
        value={value}
        onFocus={(e) => e.currentTarget.select()}
        className="w-full truncate rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700"
      />
      <button
        type="button"
        onClick={copy}
        className="shrink-0 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function SubmissionsTable({
  submissions,
  onDelete,
  hideAmounts = false,
}: {
  submissions: Submission[];
  /** When provided, each row gets a delete button (with confirmation). */
  onDelete?: (s: Submission) => Promise<void>;
  /** Demo mode: mask every dollar amount. */
  hideAmounts?: boolean;
}) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const total = submissions.reduce((sum, s) => sum + s.amount, 0);

  async function remove(s: Submission) {
    if (
      !window.confirm(
        `Delete ${s.bandmateName}'s submission (${s.invoiceNumber}, ${displayMoney(s.amount, hideAmounts)}) from this link?\n\n` +
          `This removes the record permanently — if they resubmit, they'll get a new invoice number. ` +
          `Any PDF already synced to a library is not affected.`,
      )
    ) {
      return;
    }
    setBusyKey(s.bandmateEmail);
    try {
      await onDelete?.(s);
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Submitted ({submissions.length})
      </p>
      {submissions.length === 0 ? (
        <p className="text-sm text-slate-400">No submissions yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-400">
                <th className="pb-1 pr-3 font-medium">From</th>
                <th className="pb-1 pr-3 font-medium">Invoice #</th>
                <th className="pb-1 pr-3 text-right font-medium">Amount</th>
                <th className="pb-1 font-medium">When</th>
                {onDelete ? <th className="pb-1" /> : null}
              </tr>
            </thead>
            <tbody>
              {submissions.map((s, i) => (
                <tr key={i} className="border-t border-slate-100 align-top">
                  <td className="py-1.5 pr-3">
                    <div className="font-medium text-slate-800">{s.bandmateName}</div>
                    <div className="truncate text-xs text-slate-400">{s.bandmateEmail}</div>
                  </td>
                  <td className="py-1.5 pr-3 text-slate-600">{s.invoiceNumber}</td>
                  <td className="py-1.5 pr-3 text-right text-slate-800">
                    {displayMoney(s.amount, hideAmounts)}
                  </td>
                  <td className="py-1.5 text-xs text-slate-500">
                    {new Date(s.submittedAt).toLocaleDateString("en-CA", {
                      month: "short",
                      day: "numeric",
                    })}
                  </td>
                  {onDelete ? (
                    <td className="py-1.5 pl-2 text-right">
                      <button
                        type="button"
                        onClick={() => remove(s)}
                        disabled={busyKey === s.bandmateEmail}
                        title="Delete this submission record"
                        className="rounded px-1.5 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        {busyKey === s.bandmateEmail ? "…" : "✕"}
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200">
                <td className="pt-1.5 text-xs font-semibold text-slate-500" colSpan={2}>
                  Total
                </td>
                <td className="pt-1.5 text-right text-sm font-semibold text-slate-800">
                  {displayMoney(total, hideAmounts)}
                </td>
                <td colSpan={onDelete ? 2 : 1} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Revoke = archive (reversible: the link stops working but stays listed under
 * Archived with its submissions). Permanent deletion only exists on archived
 * links, behind its own scarier confirmation.
 */
export function LinkActions({
  link,
  onArchive,
  onRestore,
  onDeleteForever,
}: {
  link: LinkRow;
  onArchive: () => Promise<void>;
  onRestore: () => Promise<void>;
  onDeleteForever: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  if (!link.archivedAt) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (
            window.confirm(
              `Revoke the link for "${link.eventName}"?\n\n` +
                `The link stops working for its recipient, but it moves to your Archived section ` +
                `with all its submissions — you can restore it anytime.`,
            )
          ) {
            run(onArchive);
          }
        }}
        className="shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        {busy ? "…" : "Revoke"}
      </button>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => run(onRestore)}
        className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-accent hover:bg-elev disabled:opacity-50"
      >
        {busy ? "…" : "Restore"}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (
            window.confirm(
              `Permanently delete "${link.eventName}"?\n\n` +
                `This erases the link AND its ${link.submissions.length} submission record` +
                `${link.submissions.length === 1 ? "" : "s"} from the server forever. ` +
                `This cannot be undone. (PDFs already synced to a library are not affected.)`,
            )
          ) {
            run(onDeleteForever);
          }
        }}
        className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        {busy ? "…" : "Delete forever"}
      </button>
    </div>
  );
}
