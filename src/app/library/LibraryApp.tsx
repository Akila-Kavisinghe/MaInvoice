"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Banner, Button, Card } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";
import { TAX_CATEGORIES, taxCategoryById } from "@/lib/t2125";
import type { Contact, LibraryEntry, RemoteInfo } from "./lib-types";
import FolderPicker from "./FolderPicker";

interface Feedback {
  tone: "success" | "error" | "info";
  message: string;
}

type DirectionFilter = "all" | "inbound" | "outbound";
type PaidFilter = "all" | "unpaid" | "paid";

/** The Invoices page: browse, filter, sync, fulfill. */
export default function LibraryApp({ initialDir }: { initialDir: string | null }) {
  const [invoiceDir, setInvoiceDir] = useState<string | null>(initialDir);
  const [remote, setRemote] = useState<RemoteInfo | null>(null); // null = loading
  const [invoices, setInvoices] = useState<LibraryEntry[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [unindexed, setUnindexed] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [syncing, setSyncing] = useState(false);
  // Filters
  const [direction, setDirection] = useState<DirectionFilter>("all");
  const [contactFilter, setContactFilter] = useState<string | null>(null);
  const [paidFilter, setPaidFilter] = useState<PaidFilter>("all");

  const load = useCallback(() => {
    fetch("/api/local/invoices")
      .then((r) => (r.ok ? r.json() : { invoices: [], unindexed: [] }))
      .then((d) => {
        setInvoices(d.invoices ?? []);
        setUnindexed(d.unindexed ?? []);
      })
      .catch(() => {});
    fetch("/api/local/contacts")
      .then((r) => (r.ok ? r.json() : { contacts: [] }))
      .then((d) => setContacts(d.contacts ?? []))
      .catch(() => {});
  }, []);

  useEffect(load, [load]);

  useEffect(() => {
    fetch("/api/local/settings")
      .then((r) => r.json())
      .then((d) => setRemote({ url: d.remoteUrl, configured: d.remoteConfigured }))
      .catch(() => setRemote({ url: null, configured: false }));
  }, []);

  // Auto-sync: once on load and every 5 minutes while the app is open.
  // Silent unless something was pulled or something went wrong.
  useEffect(() => {
    if (!remote?.configured || !invoiceDir) return;
    syncNow(true);
    const id = setInterval(() => syncNow(true), 5 * 60 * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remote?.configured, invoiceDir]);

  // First run: no folder chosen yet.
  if (!invoiceDir) {
    return (
      <>
        <h1 className="text-2xl font-semibold text-ink">Choose your invoice folder</h1>
        <p className="mt-1 text-sm text-dim">
          Invoices are organized as PDF files inside this folder. Pick one
          inside Google Drive or iCloud if you want your own cloud backup.
        </p>
        <FolderPicker
          initialPath={null}
          onChosen={(dir) => {
            setInvoiceDir(dir);
            setFeedback({ tone: "success", message: `Invoice folder set to ${dir}` });
            load();
          }}
        />
      </>
    );
  }

  async function syncNow(auto = false) {
    setSyncing(true);
    if (!auto) setFeedback(null);
    try {
      const res = await fetch("/api/local/sync", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFeedback({ tone: "error", message: data.error ?? "Sync failed" });
        return;
      }
      if (!auto || data.pulled > 0 || data.errors?.length) {
        const parts = [
          data.pulled === 0
            ? "Nothing new to pull."
            : `Pulled ${data.pulled} invoice${data.pulled === 1 ? "" : "s"}.`,
          ...(data.errors ?? []),
        ];
        setFeedback({
          tone: data.errors?.length ? "error" : "success",
          message: parts.join(" "),
        });
      }
      if (data.pulled > 0 || !auto) load();
    } catch {
      if (!auto) setFeedback({ tone: "error", message: "Network error" });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-ink">Invoices</h1>
        <Button
          onClick={() => syncNow()}
          disabled={syncing || !remote?.configured}
          className="w-auto px-5 py-2.5 text-sm"
          title={remote?.configured ? undefined : "Connect a server in Settings to sync"}
        >
          {syncing ? "Syncing…" : "Sync now"}
        </Button>
      </div>

      {feedback ? (
        <div className="mt-4">
          <Banner tone={feedback.tone}>{feedback.message}</Banner>
        </div>
      ) : null}

      {remote && !remote.configured ? (
        <div className="mt-4">
          <Banner tone="info">
            Server sync isn&apos;t set up — invoices from your links won&apos;t
            appear until you connect in{" "}
            <Link href="/library/settings" className="font-medium underline">
              Settings
            </Link>
            .
          </Banner>
        </div>
      ) : null}

      {unindexed.length > 0 ? (
        <UnindexedSection files={unindexed} onIndexed={load} />
      ) : null}

      <FilterBar
        direction={direction}
        onDirection={setDirection}
        paidFilter={paidFilter}
        onPaid={setPaidFilter}
        contactFilter={contactFilter}
        onContact={setContactFilter}
        contacts={contacts}
      />

      <InvoiceList
        invoices={invoices.filter(
          (inv) =>
            (direction === "all" || inv.direction === direction) &&
            (paidFilter === "all" ||
              (paidFilter === "paid" ? !!inv.paidAt : !inv.paidAt)) &&
            (!contactFilter || inv.contactEmail === contactFilter),
        )}
        filtered={direction !== "all" || paidFilter !== "all" || !!contactFilter}
        knownContactEmails={new Set(contacts.map((c) => c.email))}
        onChanged={load}
      />
    </>
  );
}

function FilterBar({
  direction,
  onDirection,
  paidFilter,
  onPaid,
  contactFilter,
  onContact,
  contacts,
}: {
  direction: DirectionFilter;
  onDirection: (d: DirectionFilter) => void;
  paidFilter: PaidFilter;
  onPaid: (p: PaidFilter) => void;
  contactFilter: string | null;
  onContact: (email: string | null) => void;
  contacts: Contact[];
}) {
  const tab = (value: DirectionFilter, label: string) => (
    <button
      type="button"
      onClick={() => onDirection(value)}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
        direction === value ? "bg-accent/10 text-accent" : "text-dim hover:bg-elev hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
  const selectClasses =
    "rounded-lg border border-hair bg-elev px-2.5 py-1.5 text-sm text-ink outline-none focus:border-accent";
  return (
    <div className="mt-6 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 rounded-xl border border-hair p-1">
        {tab("all", "All")}
        {tab("inbound", "Inbound")}
        {tab("outbound", "Outbound")}
      </div>
      <select
        value={paidFilter}
        onChange={(e) => onPaid(e.target.value as PaidFilter)}
        className={selectClasses}
      >
        <option value="all">Any status</option>
        <option value="unpaid">Unpaid</option>
        <option value="paid">Paid</option>
      </select>
      <select
        value={contactFilter ?? ""}
        onChange={(e) => onContact(e.target.value || null)}
        className={selectClasses}
      >
        <option value="">All contacts</option>
        {contacts.map((c) => (
          <option key={c.email} value={c.email}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function InvoiceList({
  invoices,
  filtered,
  knownContactEmails,
  onChanged,
}: {
  invoices: LibraryEntry[];
  filtered: boolean;
  knownContactEmails: Set<string>;
  onChanged: () => void;
}) {
  if (invoices.length === 0) {
    return (
      <Card className="mt-6 p-6 text-sm text-dim">
        {filtered ? (
          "No invoices match the current filters."
        ) : (
          <>
            No invoices yet. Press &quot;Sync now&quot; to pull invoices
            submitted through your links, or{" "}
            <Link href="/library/create" className="font-medium text-accent">
              create one
            </Link>
            .
          </>
        )}
      </Card>
    );
  }

  // Group by year (from event date, falling back to when it was added).
  const byYear = new Map<string, LibraryEntry[]>();
  for (const inv of invoices) {
    const year = (inv.eventDate ?? inv.addedAt).slice(0, 4);
    byYear.set(year, [...(byYear.get(year) ?? []), inv]);
  }
  const years = [...byYear.keys()].sort((a, b) => b.localeCompare(a));

  return (
    <section className="mt-6 space-y-6">
      {years.map((year) => (
        <div key={year}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
            {year}
          </h2>
          <div className="space-y-3">
            {byYear.get(year)!.map((inv) => (
              <InvoiceRow
                key={inv.id}
                invoice={inv}
                knownContact={!inv.contactEmail || knownContactEmails.has(inv.contactEmail)}
                onChanged={onChanged}
              />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function InvoiceRow({
  invoice,
  knownContact,
  onChanged,
}: {
  invoice: LibraryEntry;
  /** False when the sender has an email but no contact card yet. */
  knownContact: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const receiptRef = useRef<HTMLInputElement>(null);
  const filename = invoice.relPath.split("/").pop() ?? invoice.relPath;
  const inbound = invoice.direction !== "outbound";

  async function remove() {
    if (!window.confirm(`Delete "${filename}" from your invoice folder?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/local/invoices/${invoice.id}`, {
        method: "DELETE",
      });
      if (res.ok) onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function patch(body: {
    emailReceived?: boolean;
    paid?: boolean;
    taxCategory?: string | null;
  }) {
    setBusy(true);
    try {
      const res = await fetch(`/api/local/invoices/${invoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function uploadReceipt(file: File) {
    setBusy(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch(`/api/local/invoices/${invoice.id}/receipt`, {
        method: "POST",
        body,
      });
      if (res.ok) onChanged();
      else {
        const data = await res.json().catch(() => ({}));
        window.alert(data.error ?? "Receipt upload failed");
      }
    } finally {
      setBusy(false);
      if (receiptRef.current) receiptRef.current.value = "";
    }
  }

  const flagButton =
    "rounded-lg px-2 py-1 text-xs font-medium disabled:opacity-50";

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-800">
            <span
              className={`mr-2 inline-block rounded px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide ${
                inbound ? "bg-accent/10 text-accent" : "bg-success/10 text-success"
              }`}
            >
              {inbound ? "In" : "Out"}
            </span>
            {invoice.eventName || filename}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {[
              invoice.contactName ?? invoice.bandmateName,
              invoice.invoiceNumber,
              typeof invoice.amount === "number" ? formatMoney(invoice.amount) : null,
              invoice.eventDate ? formatDate(invoice.eventDate) : null,
            ]
              .filter(Boolean)
              .join(" · ") || "No details"}
          </p>
          <p className="mt-0.5 truncate text-xs text-slate-400">{invoice.relPath}</p>

          {/* Status + fulfillment controls */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {invoice.paidAt ? (
              <>
                <span className="rounded-lg bg-success/10 px-2 py-1 text-xs font-medium text-success">
                  Paid{" "}
                  {new Date(invoice.paidAt).toLocaleDateString("en-CA", {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                {invoice.receiptPath ? (
                  <a
                    href={`/api/local/invoices/${invoice.id}/receipt`}
                    target="_blank"
                    rel="noreferrer"
                    className={`${flagButton} text-accent hover:bg-elev`}
                  >
                    View receipt
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => receiptRef.current?.click()}
                    disabled={busy}
                    className={`${flagButton} text-dim hover:bg-elev hover:text-ink`}
                  >
                    Attach receipt
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => patch({ paid: false })}
                  disabled={busy}
                  className={`${flagButton} text-dim hover:bg-elev hover:text-ink`}
                >
                  Mark unpaid
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => receiptRef.current?.click()}
                  disabled={busy}
                  className={`${flagButton} bg-elev text-ink hover:brightness-110`}
                >
                  Attach receipt
                </button>
                <button
                  type="button"
                  onClick={() => patch({ paid: true })}
                  disabled={busy}
                  className={`${flagButton} text-dim hover:bg-elev hover:text-ink`}
                >
                  Mark paid
                </button>
              </>
            )}
            {inbound ? (
              <button
                type="button"
                onClick={() => patch({ emailReceived: !invoice.emailReceived })}
                disabled={busy}
                className={`${flagButton} ${
                  invoice.emailReceived
                    ? "bg-success/10 text-success"
                    : "text-dim hover:bg-elev hover:text-ink"
                }`}
                title="Did the sender email you this invoice?"
              >
                {invoice.emailReceived ? "Emailed ✓" : "Mark emailed"}
              </button>
            ) : null}
            {inbound ? (
              <select
                value={invoice.taxCategory ?? ""}
                disabled={busy}
                onChange={(e) => patch({ taxCategory: e.target.value || null })}
                title="T2125 tax category"
                className={`rounded-lg border border-hair bg-elev px-1.5 py-1 text-xs outline-none focus:border-accent ${
                  invoice.taxCategory ? "text-ink" : "text-danger"
                }`}
              >
                <option value="">Tax: uncategorized</option>
                {TAX_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            ) : null}
            {inbound && taxCategoryById(invoice.taxCategory)?.capital ? (
              <span
                className="rounded-lg bg-danger/10 px-2 py-1 text-xs font-medium text-danger"
                title="Equipment with lasting value is usually depreciated (CCA), not fully expensed in the purchase year."
              >
                Possible capital asset
              </span>
            ) : null}
            {!knownContact && invoice.contactEmail ? (
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await fetch("/api/local/contacts", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        email: invoice.contactEmail,
                        name: invoice.contactName ?? invoice.bandmateName ?? "",
                      }),
                    });
                    onChanged();
                  } finally {
                    setBusy(false);
                  }
                }}
                className={`${flagButton} bg-accent/10 text-accent hover:brightness-110`}
                title={`Save ${invoice.contactEmail} as a contact`}
              >
                + Add to contacts
              </button>
            ) : null}
          </div>
          <input
            ref={receiptRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadReceipt(f);
            }}
          />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <a
            href={`/api/local/invoices/${invoice.id}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-accent hover:bg-elev"
          >
            View
          </a>
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {busy ? "…" : "Delete"}
          </button>
        </div>
      </div>
    </Card>
  );
}

function UnindexedSection({
  files,
  onIndexed,
}: {
  files: string[];
  onIndexed: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  async function index(relPath: string) {
    setBusy(relPath);
    try {
      const res = await fetch("/api/local/index-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relPath }),
      });
      if (res.ok) onIndexed();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="mt-6 p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
        Found in folder, not indexed yet
      </h2>
      <p className="mt-1 text-xs text-dim">
        These PDFs are in your folder but not in the library index — add them to
        organize and track them here.
      </p>
      <ul className="mt-3 space-y-2">
        {files.map((f) => (
          <li key={f} className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate text-sm text-slate-700">{f}</span>
            <button
              type="button"
              onClick={() => index(f)}
              disabled={busy === f}
              className="shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-medium text-accent hover:bg-elev disabled:opacity-50"
            >
              {busy === f ? "Indexing…" : "Index"}
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
