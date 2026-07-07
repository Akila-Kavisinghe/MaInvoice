"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Banner, Button, Card, Input, Label, Textarea } from "@/components/ui";
import { HIDDEN_MONEY, displayMoney } from "@/lib/format";
import { TAX_CATEGORIES, effectiveTaxCategoryId, taxCategoryById } from "@/lib/t2125";
import type { CategoryTag, Contact, LibraryEntry, RemoteInfo } from "./lib-types";
import { tagColorClasses } from "./tag-colors";
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
  const [categoryTags, setCategoryTags] = useState<CategoryTag[]>([]);
  const [unindexed, setUnindexed] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [syncing, setSyncing] = useState(false);
  // Filters
  const [direction, setDirection] = useState<DirectionFilter>("all");
  const [contactFilter, setContactFilter] = useState<string | null>(null);
  const [paidFilter, setPaidFilter] = useState<PaidFilter>("all");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [hideAmounts, setHideAmounts] = useState(false);

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
    fetch("/api/local/tags")
      .then((r) => (r.ok ? r.json() : { tags: [] }))
      .then((d) => setCategoryTags(d.tags ?? []))
      .catch(() => {});
  }, []);

  useEffect(load, [load]);

  // Deep link from the Contacts page: /library?contact=<email> pre-filters
  // the list to that contact.
  useEffect(() => {
    const email = new URLSearchParams(window.location.search).get("contact");
    if (email) setContactFilter(email.toLowerCase());
  }, []);

  useEffect(() => {
    fetch("/api/local/settings")
      .then((r) => r.json())
      .then((d) => {
        setRemote({ url: d.remoteUrl, configured: d.remoteConfigured });
        setHideAmounts(!!d.hideAmounts);
      })
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
        tagFilter={tagFilter}
        onTag={setTagFilter}
        allEventTags={allEventTags(invoices)}
      />

      <InvoiceList
        invoices={invoices.filter(
          (inv) =>
            (direction === "all" || inv.direction === direction) &&
            (paidFilter === "all" ||
              (paidFilter === "paid" ? !!inv.paidAt : !inv.paidAt)) &&
            (!contactFilter || inv.contactEmail === contactFilter) &&
            (!tagFilter || (inv.eventTags ?? []).includes(tagFilter)),
        )}
        filtered={
          direction !== "all" || paidFilter !== "all" || !!contactFilter || !!tagFilter
        }
        knownContactEmails={new Set(contacts.map((c) => c.email))}
        categoryTags={categoryTags}
        allEventTags={allEventTags(invoices)}
        allEventNames={allEventNames(invoices)}
        hideAmounts={hideAmounts}
        onChanged={load}
      />
    </>
  );
}

/** Every event tag in use, alphabetical. */
function allEventTags(invoices: LibraryEntry[]): string[] {
  return [...new Set(invoices.flatMap((i) => i.eventTags ?? []))].sort((a, b) =>
    a.localeCompare(b),
  );
}

/** Every event name in use — autofill suggestions for recurring gigs. */
function allEventNames(invoices: LibraryEntry[]): string[] {
  return [
    ...new Set(invoices.map((i) => i.eventName).filter((n): n is string => !!n)),
  ].sort((a, b) => a.localeCompare(b));
}

function FilterBar({
  direction,
  onDirection,
  paidFilter,
  onPaid,
  contactFilter,
  onContact,
  contacts,
  tagFilter,
  onTag,
  allEventTags,
}: {
  direction: DirectionFilter;
  onDirection: (d: DirectionFilter) => void;
  paidFilter: PaidFilter;
  onPaid: (p: PaidFilter) => void;
  contactFilter: string | null;
  onContact: (email: string | null) => void;
  contacts: Contact[];
  tagFilter: string | null;
  onTag: (tag: string | null) => void;
  allEventTags: string[];
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
      {allEventTags.length > 0 ? (
        <select
          value={tagFilter ?? ""}
          onChange={(e) => onTag(e.target.value || null)}
          className={selectClasses}
        >
          <option value="">All tags</option>
          {allEventTags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}

function InvoiceList({
  invoices,
  filtered,
  knownContactEmails,
  categoryTags,
  allEventTags,
  allEventNames,
  hideAmounts,
  onChanged,
}: {
  invoices: LibraryEntry[];
  filtered: boolean;
  knownContactEmails: Set<string>;
  categoryTags: CategoryTag[];
  allEventTags: string[];
  allEventNames: string[];
  hideAmounts: boolean;
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

  const headCell = "py-2 font-semibold";
  return (
    <div className="mt-6 overflow-x-auto">
      <table className="w-full min-w-[560px] table-fixed border-collapse text-sm">
        <thead>
          <tr className="border-b border-hair text-left text-[11px] uppercase tracking-wide text-slate-400">
            <th className={`w-11 ${headCell}`}></th>
            <th className={headCell}>Event</th>
            <th className={`w-36 ${headCell}`}>Contact</th>
            <th className={`w-24 text-right pr-4 ${headCell}`}>Amount</th>
            <th className={`w-16 ${headCell}`}>Date</th>
            <th className={`w-24 ${headCell}`}>Status</th>
            <th className="w-40"></th>
          </tr>
        </thead>
        {years.map((year) => (
          <tbody key={year}>
            <tr>
              <td
                colSpan={7}
                className="pt-5 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400"
              >
                {year}
              </td>
            </tr>
            {byYear.get(year)!.map((inv) => (
              <InvoiceRow
                key={inv.id}
                invoice={inv}
                knownContact={!inv.contactEmail || knownContactEmails.has(inv.contactEmail)}
                categoryTags={categoryTags}
                allEventTags={allEventTags}
                allEventNames={allEventNames}
                hideAmounts={hideAmounts}
                onChanged={onChanged}
              />
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

function InvoiceRow({
  invoice,
  knownContact,
  categoryTags,
  allEventTags,
  allEventNames,
  hideAmounts,
  onChanged,
}: {
  invoice: LibraryEntry;
  /** False when the sender has an email but no contact card yet. */
  knownContact: boolean;
  categoryTags: CategoryTag[];
  allEventTags: string[];
  allEventNames: string[];
  hideAmounts: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Receipt staged for upload — confirmed with a paid date before it's sent.
  // Receipts staged for upload — a queue, saved one at a time so each keeps
  // its own (auto-detected) payment date.
  const [pendingReceipts, setPendingReceipts] = useState<File[]>([]);
  const [receiptDate, setReceiptDate] = useState("");
  const [receiptDateAuto, setReceiptDateAuto] = useState(false);
  // Inline "mark paid" reason capture (no receipt).
  const [markingPaid, setMarkingPaid] = useState(false);
  const [paidReasonDraft, setPaidReasonDraft] = useState("");
  const receiptRef = useRef<HTMLInputElement>(null);
  const filename = invoice.relPath.split("/").pop() ?? invoice.relPath;
  const inbound = invoice.direction !== "outbound";

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch(`/api/local/invoices/${invoice.id}`, {
        method: "DELETE",
      });
      if (res.ok) onChanged();
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  async function patch(body: {
    emailReceived?: boolean;
    paid?: boolean;
    paidReason?: string;
    taxCategory?: string | null;
    categoryTag?: string | null;
    eventTags?: string[];
    eventName?: string;
    description?: string;
    eventDate?: string;
    contactName?: string;
    amount?: number | null;
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

  // Set the "Paid on" field for the queue's head file, auto-detecting the
  // date off a PDF receipt (e.g. TD e-transfer's "Date Sent"). Best-effort.
  async function detectDate(file: File) {
    setReceiptDateAuto(false);
    setReceiptDate(
      invoice.paidAt
        ? invoice.paidAt.slice(0, 10)
        : new Date().toLocaleDateString("en-CA"),
    );
    if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") {
      try {
        const body = new FormData();
        body.set("file", file);
        const res = await fetch("/api/local/parse-receipt", { method: "POST", body });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.paidDate) {
          setReceiptDate(data.paidDate);
          setReceiptDateAuto(true);
        }
      } catch {
        /* best-effort — the manual date field still works */
      }
    }
  }

  async function stageReceipts(files: File[]) {
    if (files.length === 0) return;
    setPendingReceipts(files);
    await detectDate(files[0]);
  }

  async function uploadReceipt() {
    const file = pendingReceipts[0];
    if (!file) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.set("file", file);
      if (receiptDate) body.set("paidDate", receiptDate);
      const res = await fetch(`/api/local/invoices/${invoice.id}/receipt`, {
        method: "POST",
        body,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        window.alert(data.error ?? "Receipt upload failed");
        return;
      }
      onChanged();
      const rest = pendingReceipts.slice(1);
      setPendingReceipts(rest);
      if (rest.length > 0) {
        await detectDate(rest[0]);
      } else if (receiptRef.current) {
        receiptRef.current.value = "";
      }
    } finally {
      setBusy(false);
    }
  }

  async function markPaid() {
    setBusy(true);
    try {
      await patch({ paid: true, paidReason: paidReasonDraft.trim() });
      setMarkingPaid(false);
      setPaidReasonDraft("");
    } finally {
      setBusy(false);
    }
  }

  async function removeReceiptAt(i: number) {
    setBusy(true);
    try {
      const res = await fetch(`/api/local/invoices/${invoice.id}/receipt?i=${i}`, {
        method: "DELETE",
      });
      if (res.ok) onChanged();
    } finally {
      setBusy(false);
    }
  }

  const flagButton =
    "rounded-lg px-2 py-1 text-xs font-medium disabled:opacity-50";
  const iconBtn =
    "rounded-md p-1.5 text-slate-400 transition hover:bg-elev hover:text-ink disabled:opacity-40";

  const effectiveCategory = effectiveTaxCategoryId(
    invoice,
    Object.fromEntries(categoryTags.map((t) => [t.name, t.taxCategory])),
  );

  const shortDate = invoice.eventDate
    ? new Date(`${invoice.eventDate}T12:00:00`).toLocaleDateString("en-CA", {
        month: "short",
        day: "numeric",
      })
    : "—";

  return (
    <>
      {/* Summary row — double-click a cell to edit it; icons on the right. */}
      <tr
        onClick={() => setExpanded((e) => !e)}
        className={`group cursor-pointer border-b border-hair/60 align-top transition-colors hover:bg-elev/60 ${
          expanded ? "bg-elev/40" : ""
        }`}
      >
        <td className="py-2">
          <span
            className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
              inbound ? "bg-accent/10 text-accent" : "bg-success/10 text-success"
            }`}
          >
            {inbound ? "In" : "Out"}
          </span>
        </td>
        <td className="py-2 pr-2">
          <EditableCell
            value={invoice.eventName ?? ""}
            display={
              <span className="block truncate font-medium text-slate-800">
                {invoice.eventName || filename}
              </span>
            }
            suggestions={allEventNames}
            onSave={(v) => patch({ eventName: v })}
          />
          <EditableCell
            value={invoice.description ?? ""}
            display={
              invoice.description ? (
                <span className="block truncate text-xs text-slate-500">
                  {invoice.description}
                </span>
              ) : (
                <span className="block text-xs italic text-slate-400 opacity-0 transition group-hover:opacity-70">
                  add description…
                </span>
              )
            }
            onSave={(v) => patch({ description: v })}
            inputClassName="text-xs"
          />
          {(invoice.eventTags?.length ?? 0) > 0 ? (
            <div className="mt-0.5 flex flex-wrap gap-1">
              {invoice.eventTags!.map((t) => (
                <span
                  key={t}
                  className={`rounded-full px-1.5 text-[10px] font-medium ${tagColorClasses(t)}`}
                >
                  {t}
                </span>
              ))}
            </div>
          ) : null}
        </td>
        <td className="py-2 pr-2 text-slate-500">
          <EditableCell
            value={invoice.contactName ?? invoice.bandmateName ?? ""}
            display={
              <span className="block truncate">
                {invoice.contactName ?? invoice.bandmateName ?? (
                  <span className="text-slate-400">—</span>
                )}
              </span>
            }
            onSave={(v) => patch({ contactName: v })}
          />
        </td>
        <td className="py-2 pr-4 text-right tabular-nums text-slate-700">
          {hideAmounts ? (
            // Demo mode: masked and NOT editable (editing would reveal it).
            <span className="text-slate-400">{HIDDEN_MONEY}</span>
          ) : (
            <EditableCell
              type="number"
              value={typeof invoice.amount === "number" ? String(invoice.amount) : ""}
              display={
                typeof invoice.amount === "number" ? (
                  displayMoney(invoice.amount)
                ) : (
                  <span className="text-slate-400">—</span>
                )
              }
              inputClassName="text-right"
              onSave={(v) => {
                const s = v.trim();
                const n = s === "" ? null : Number(s);
                if (n !== null && !Number.isFinite(n)) return;
                patch({ amount: n });
              }}
            />
          )}
        </td>
        <td className="py-2 text-slate-500">
          <EditableCell
            type="date"
            value={invoice.eventDate ?? ""}
            display={shortDate}
            onSave={(v) => patch({ eventDate: v })}
          />
        </td>
        <td className="py-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium">
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                invoice.paidAt ? "bg-success" : "bg-slate-300"
              }`}
            />
            <span className={invoice.paidAt ? "text-success" : "text-slate-500"}>
              {invoice.paidAt ? "Paid" : "Unpaid"}
            </span>
            {inbound && invoice.emailReceived ? (
              <span className="text-success" title="Sender emailed this invoice">
                ✉
              </span>
            ) : null}
          </span>
        </td>
        <td className="py-2">
          {confirmDelete ? (
            <div
              className="flex items-center justify-end gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="text-xs text-slate-500">Delete?</span>
              <button
                type="button"
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation();
                  remove();
                }}
                className="rounded-md bg-red-500 px-2 py-1 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-50"
              >
                {busy ? "…" : "Yes"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDelete(false);
                }}
                className="rounded-md px-2 py-1 text-xs font-medium text-dim hover:bg-elev hover:text-ink disabled:opacity-50"
              >
                No
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-0.5">
              <a
                href={`/api/local/invoices/${invoice.id}`}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className={iconBtn}
                title="View PDF"
              >
                <EyeIcon />
              </a>
              <button
                type="button"
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(true);
                  setEditing(true);
                }}
                className={iconBtn}
                title="Edit details"
              >
                <PenIcon />
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDelete(true);
                }}
                className={`${iconBtn} hover:bg-red-500/10 hover:text-red-500`}
                title="Delete"
              >
                <TrashIcon />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded((x) => !x);
                }}
                className={`${iconBtn} ${expanded ? "rotate-180" : ""}`}
                title={expanded ? "Collapse" : "More"}
              >
                <ChevronIcon />
              </button>
            </div>
          )}
        </td>
      </tr>

      {expanded ? (
        <tr className="border-b border-hair/60 bg-elev/30">
          <td colSpan={7} className="px-1 pb-4 pt-1">
            <p className="mb-2 truncate text-xs text-slate-400" title={invoice.relPath}>
              {invoice.relPath}
            </p>

            {/* Status + fulfillment controls */}
            <div className="flex flex-wrap items-center gap-1.5">
            {invoice.paidAt ? (
              <>
                <span className="rounded-lg bg-success/10 px-2 py-1 text-xs font-medium text-success">
                  Paid{" "}
                  {new Date(invoice.paidAt).toLocaleDateString("en-CA", {
                    month: "short",
                    day: "numeric",
                  })}
                  {invoice.paidReason ? ` · ${invoice.paidReason}` : ""}
                </span>
                {(invoice.receiptPaths ?? []).map((rp, i) => (
                  <span
                    key={rp}
                    className="inline-flex items-center gap-1 rounded-lg bg-elev px-1.5 py-1 text-xs"
                  >
                    <a
                      href={`/api/local/invoices/${invoice.id}/receipt?i=${i}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-accent hover:underline"
                    >
                      Receipt{(invoice.receiptPaths?.length ?? 0) > 1 ? ` ${i + 1}` : ""}
                    </a>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => removeReceiptAt(i)}
                      className="text-muted hover:text-danger disabled:opacity-40"
                      title="Remove this receipt"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  onClick={() => receiptRef.current?.click()}
                  disabled={busy}
                  className={`${flagButton} text-dim hover:bg-elev hover:text-ink`}
                >
                  + receipt
                </button>
                <button
                  type="button"
                  onClick={() => patch({ paid: false })}
                  disabled={busy}
                  className={`${flagButton} text-dim hover:bg-elev hover:text-ink`}
                >
                  Mark unpaid
                </button>
              </>
            ) : markingPaid ? (
              <span className="inline-flex items-center gap-1.5">
                <input
                  autoFocus
                  value={paidReasonDraft}
                  onChange={(e) => setPaidReasonDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      markPaid();
                    }
                    if (e.key === "Escape") {
                      setMarkingPaid(false);
                      setPaidReasonDraft("");
                    }
                  }}
                  placeholder="Reason (optional) — e.g. Cash"
                  className="w-56 rounded-lg border border-hair bg-panel px-2 py-1 text-xs text-ink outline-none focus:border-accent"
                />
                <button
                  type="button"
                  onClick={markPaid}
                  disabled={busy}
                  className={`${flagButton} bg-success/10 text-success hover:brightness-110`}
                >
                  {busy ? "…" : "Mark paid"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMarkingPaid(false);
                    setPaidReasonDraft("");
                  }}
                  disabled={busy}
                  className={`${flagButton} text-dim hover:bg-elev hover:text-ink`}
                >
                  Cancel
                </button>
              </span>
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
                  onClick={() => {
                    setPaidReasonDraft("");
                    setMarkingPaid(true);
                  }}
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
                value={
                  invoice.categoryTag &&
                  categoryTags.some((t) => t.name === invoice.categoryTag)
                    ? `tag:${invoice.categoryTag}`
                    : (invoice.taxCategory ?? "")
                }
                disabled={busy}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v.startsWith("tag:")) {
                    patch({ categoryTag: v.slice(4) });
                  } else {
                    // Picking a raw category (or clearing) also drops the tag.
                    patch({ taxCategory: v || null, categoryTag: null });
                  }
                }}
                title="T2125 tax category — your tags map onto real categories"
                className={`rounded-lg border border-hair bg-elev px-1.5 py-1 text-xs outline-none focus:border-accent ${
                  effectiveCategory ? "text-ink" : "text-danger"
                }`}
              >
                <option value="">Tax: uncategorized</option>
                {categoryTags.length > 0 ? (
                  <optgroup label="My tags">
                    {categoryTags.map((t) => (
                      <option key={t.name} value={`tag:${t.name}`}>
                        {t.name} → {taxCategoryById(t.taxCategory)?.label ?? t.taxCategory}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                <optgroup label="T2125 categories">
                  {TAX_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </optgroup>
              </select>
            ) : null}
            {inbound && taxCategoryById(effectiveCategory)?.capital ? (
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

          {/* Grouping tags: chips + adder */}
          <EventTagEditor
            tags={invoice.eventTags ?? []}
            suggestions={allEventTags}
            busy={busy}
            onChange={(eventTags) => patch({ eventTags })}
          />
          {pendingReceipts.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-[10px] border border-hair bg-elev px-3 py-2">
              <span className="max-w-56 truncate text-xs font-medium text-ink">
                {pendingReceipts[0].name}
                {pendingReceipts.length > 1
                  ? ` (+${pendingReceipts.length - 1} more)`
                  : ""}
              </span>
              <label className="flex items-center gap-1.5 text-xs text-dim">
                Paid on
                <input
                  type="date"
                  value={receiptDate}
                  onChange={(e) => {
                    setReceiptDate(e.target.value);
                    setReceiptDateAuto(false);
                  }}
                  className="rounded-lg border border-hair bg-panel px-2 py-1 text-xs text-ink outline-none focus:border-accent"
                />
              </label>
              {receiptDateAuto ? (
                <span
                  className="text-xs font-medium text-success"
                  title="Read from the receipt PDF — change it if it's wrong"
                >
                  detected ✓
                </span>
              ) : null}
              <button
                type="button"
                onClick={uploadReceipt}
                disabled={busy || !receiptDate}
                className={`${flagButton} bg-accent/10 text-accent hover:brightness-110`}
              >
                {busy
                  ? "Attaching…"
                  : pendingReceipts.length > 1
                    ? "Attach & next"
                    : "Attach"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setPendingReceipts([]);
                  if (receiptRef.current) receiptRef.current.value = "";
                }}
                className={`${flagButton} text-dim hover:bg-panel hover:text-ink`}
              >
                Cancel
              </button>
            </div>
          ) : null}
          <input
            ref={receiptRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) stageReceipts([...e.target.files]);
            }}
          />

            {editing ? (
              <EditDetailsForm
                invoice={invoice}
                eventNames={allEventNames}
                onClose={() => setEditing(false)}
                onSaved={onChanged}
              />
            ) : null}
          </td>
        </tr>
      ) : null}
    </>
  );
}

/**
 * Chips for an invoice's grouping tags, with a small inline adder that
 * suggests tags already in use elsewhere.
 */
function EventTagEditor({
  tags,
  suggestions,
  busy,
  onChange,
}: {
  tags: string[];
  suggestions: string[];
  busy: boolean;
  onChange: (tags: string[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const datalistId = useRef(`tags-${Math.random().toString(36).slice(2)}`);

  function commit() {
    const t = draft.trim();
    setDraft("");
    setAdding(false);
    if (t && !tags.includes(t)) onChange([...tags, t]);
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <span
          key={t}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tagColorClasses(t)}`}
        >
          {t}
          <button
            type="button"
            disabled={busy}
            onClick={() => onChange(tags.filter((x) => x !== t))}
            className="opacity-60 hover:opacity-100 disabled:opacity-40"
            title={`Remove tag ${t}`}
          >
            ×
          </button>
        </span>
      ))}
      {adding ? (
        <input
          autoFocus
          value={draft}
          list={datalistId.current}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
            if (e.key === "Escape") {
              setDraft("");
              setAdding(false);
            }
          }}
          placeholder="tag name"
          className="w-32 rounded-full border border-hair bg-elev px-2 py-0.5 text-xs text-ink outline-none focus:border-accent"
        />
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => setAdding(true)}
          className="rounded-full px-2 py-0.5 text-xs font-medium text-muted hover:bg-elev hover:text-ink disabled:opacity-50"
          title="Group this expense with a tag (e.g. a tour or project)"
        >
          + tag
        </button>
      )}
      <datalist id={datalistId.current}>
        {suggestions
          .filter((s) => !tags.includes(s))
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>
    </div>
  );
}

/**
 * Inline editor for an invoice's details. Saving an event name/date change
 * also re-files the PDF into the matching "<year>/<date event>" folder.
 */
function EditDetailsForm({
  invoice,
  eventNames,
  onClose,
  onSaved,
}: {
  invoice: LibraryEntry;
  eventNames: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    eventName: invoice.eventName ?? "",
    description: invoice.description ?? "",
    eventDate: invoice.eventDate ?? "",
    contactName: invoice.contactName ?? invoice.bandmateName ?? "",
    contactEmail: invoice.contactEmail ?? "",
    invoiceNumber: invoice.invoiceNumber ?? "",
    amount: typeof invoice.amount === "number" ? String(invoice.amount) : "",
    notes: invoice.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof f>(key: K, value: string) {
    setF((p) => ({ ...p, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amountStr = f.amount.trim();
    const amount = amountStr === "" ? null : Number(amountStr);
    if (amount !== null && !Number.isFinite(amount)) {
      setError("Amount must be a number.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/local/invoices/${invoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventName: f.eventName.trim(),
          description: f.description.trim(),
          eventDate: f.eventDate,
          contactName: f.contactName.trim(),
          contactEmail: f.contactEmail.trim(),
          invoiceNumber: f.invoiceNumber.trim(),
          amount,
          notes: f.notes.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const issues = data.issues
          ? Object.values(data.issues as Record<string, string[]>)
              .flat()
              .join(" ")
          : "";
        setError([data.error, issues].filter(Boolean).join(" — ") || "Save failed");
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-3 space-y-3 border-t border-hair pt-3"
      noValidate
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Event name</Label>
          <Input
            value={f.eventName}
            onChange={(e) => set("eventName", e.target.value)}
            list={`edit-events-${invoice.id}`}
          />
          <datalist id={`edit-events-${invoice.id}`}>
            {eventNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </div>
        <div>
          <Label hint="(optional)">Description</Label>
          <Input
            value={f.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </div>
        <div>
          <Label>Event date</Label>
          <Input
            type="date"
            value={f.eventDate}
            onChange={(e) => set("eventDate", e.target.value)}
          />
        </div>
        <div>
          <Label>{invoice.direction === "outbound" ? "Billed to" : "Who it's from"}</Label>
          <Input
            value={f.contactName}
            onChange={(e) => set("contactName", e.target.value)}
          />
        </div>
        <div>
          <Label hint="(optional)">Their email</Label>
          <Input
            type="email"
            value={f.contactEmail}
            onChange={(e) => set("contactEmail", e.target.value)}
          />
        </div>
        <div>
          <Label>Invoice #</Label>
          <Input
            value={f.invoiceNumber}
            onChange={(e) => set("invoiceNumber", e.target.value)}
          />
        </div>
        <div>
          <Label>Amount</Label>
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={f.amount}
            onChange={(e) => set("amount", e.target.value)}
            placeholder="0.00"
          />
        </div>
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea
          rows={2}
          value={f.notes}
          onChange={(e) => set("notes", e.target.value)}
        />
      </div>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-dim hover:bg-elev hover:text-ink disabled:opacity-50"
        >
          Cancel
        </button>
        <Button type="submit" disabled={saving} className="px-4 py-1.5 text-sm">
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

/**
 * A table cell whose text is editable in place: shows `display` normally,
 * swaps to an input on double-click, and commits the change on blur/Enter
 * (Escape cancels). Single clicks are swallowed so they don't toggle the
 * row's expand.
 */
function EditableCell({
  value,
  display,
  type = "text",
  suggestions,
  onSave,
  inputClassName,
}: {
  value: string;
  display?: React.ReactNode;
  type?: string;
  suggestions?: string[];
  onSave: (v: string) => void;
  inputClassName?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const listId = useRef(`ec-${Math.random().toString(36).slice(2)}`);

  function commit() {
    setEditing(false);
    if (draft !== value) onSave(draft);
  }

  if (!editing) {
    return (
      <div
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setDraft(value);
          setEditing(true);
        }}
        title="Double-click to edit"
        className="cursor-text"
      >
        {display ?? (value || <span className="text-slate-400">—</span>)}
      </div>
    );
  }

  return (
    <>
      <input
        autoFocus
        type={type}
        value={draft}
        list={suggestions ? listId.current : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        className={`w-full rounded border border-accent bg-panel px-1.5 py-0.5 text-sm text-ink outline-none ${inputClassName ?? ""}`}
      />
      {suggestions ? (
        <datalist id={listId.current}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      ) : null}
    </>
  );
}

const iconProps = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};
function EyeIcon() {
  return (
    <svg {...iconProps}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function PenIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  );
}
function ChevronIcon() {
  return (
    <svg {...iconProps}>
      <path d="M6 9l6 6 6-6" />
    </svg>
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
