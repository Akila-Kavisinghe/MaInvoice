"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Banner,
  Button,
  Card,
  Input,
  Label,
  Logo,
  Textarea,
} from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";
import type { BusinessInfo, Contact, LibraryEntry } from "./lib-types";
import OutboundForm from "./OutboundForm";
import ContactsCard from "./ContactsCard";
import BusinessCard from "./BusinessCard";
import LinkForm from "./LinkForm";

interface Feedback {
  tone: "success" | "error" | "info";
  message: string;
}

interface RemoteInfo {
  url: string | null;
  configured: boolean;
}

type DirectionFilter = "all" | "inbound" | "outbound";
type PaidFilter = "all" | "unpaid" | "paid";

const DEFAULT_SERVER_URL = "https://mainvoice-sigma.vercel.app";
const EMPTY_BUSINESS: BusinessInfo = {
  name: "",
  email: "",
  address: "",
  phone: "",
  taxNumber: "",
};

export default function LibraryApp({ initialDir }: { initialDir: string | null }) {
  const [invoiceDir, setInvoiceDir] = useState<string | null>(initialDir);
  const [picking, setPicking] = useState(initialDir === null);
  const [remote, setRemote] = useState<RemoteInfo | null>(null); // null = loading
  const [editingServer, setEditingServer] = useState(false);
  const [business, setBusiness] = useState<BusinessInfo>(EMPTY_BUSINESS);
  const [editingBusiness, setEditingBusiness] = useState(false);
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
      .then((d) => {
        setRemote({ url: d.remoteUrl, configured: d.remoteConfigured });
        if (d.business) setBusiness(d.business);
      })
      .catch(() => setRemote({ url: null, configured: false }));
  }, []);

  // Auto-sync: once on load and every 5 minutes while the app is open.
  // Silent unless something was pulled or something went wrong.
  useEffect(() => {
    if (!remote?.configured || picking || !invoiceDir) return;
    syncNow(true);
    const id = setInterval(() => syncNow(true), 5 * 60 * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remote?.configured, invoiceDir, picking]);

  if (picking || !invoiceDir) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <Logo className="mb-6" />
        <h1 className="text-2xl font-semibold text-ink">
          {invoiceDir ? "Change invoice folder" : "Choose your invoice folder"}
        </h1>
        <p className="mt-1 text-sm text-dim">
          Invoices are organized as PDF files inside this folder. Pick one
          inside Google Drive or Dropbox if you want your own cloud backup.
        </p>
        <FolderPicker
          initialPath={invoiceDir}
          onChosen={(dir) => {
            setInvoiceDir(dir);
            setPicking(false);
            setFeedback({ tone: "success", message: `Invoice folder set to ${dir}` });
            load();
          }}
          onCancel={invoiceDir ? () => setPicking(false) : undefined}
        />
      </main>
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
      if (data.pulled > 0) load();
      else if (!auto) load();
    } catch {
      if (!auto) setFeedback({ tone: "error", message: "Network error" });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Logo className="mb-6" />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Invoice library</h1>
          <p className="mt-1 break-all text-xs text-muted">
            {invoiceDir}
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="ml-2 font-medium text-accent hover:text-accent-strong"
            >
              Change
            </button>
          </p>
          <p className="mt-0.5 break-all text-xs text-muted">
            {remote?.configured ? (
              <>
                Syncing from {remote.url}
                <button
                  type="button"
                  onClick={() => setEditingServer(true)}
                  className="ml-2 font-medium text-accent hover:text-accent-strong"
                >
                  Change
                </button>
              </>
            ) : remote ? (
              "Server sync not set up"
            ) : null}
          </p>
          <p className="mt-0.5 break-all text-xs text-muted">
            {business.name ? `Invoicing as ${business.name}` : "Business details not set"}
            <button
              type="button"
              onClick={() => setEditingBusiness(true)}
              className="ml-2 font-medium text-accent hover:text-accent-strong"
            >
              {business.name ? "Change" : "Set up"}
            </button>
          </p>
        </div>
        <Button
          onClick={() => syncNow()}
          disabled={syncing || !remote?.configured}
          className="w-auto px-5 py-2.5 text-sm"
        >
          {syncing ? "Syncing…" : "Sync now"}
        </Button>
      </div>

      {feedback ? (
        <div className="mt-4">
          <Banner tone={feedback.tone}>{feedback.message}</Banner>
        </div>
      ) : null}

      {remote && (!remote.configured || editingServer) ? (
        <ServerCard
          initialUrl={remote.url}
          onSaved={(r) => {
            setRemote(r);
            setEditingServer(false);
            setFeedback({ tone: "success", message: "Server connection saved." });
          }}
          onCancel={remote.configured ? () => setEditingServer(false) : undefined}
        />
      ) : null}

      {editingBusiness ? (
        <BusinessCard
          initial={business}
          onSaved={(b) => {
            setBusiness(b);
            setEditingBusiness(false);
            setFeedback({ tone: "success", message: "Business details saved." });
          }}
          onCancel={() => setEditingBusiness(false)}
        />
      ) : null}

      <div className="flex flex-wrap items-start gap-2">
        <LinkForm business={business} remoteConfigured={!!remote?.configured} />
        <OutboundForm contacts={contacts} onCreated={load} />
      </div>

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
        onChanged={load}
      />

      <ContactsCard
        contacts={contacts}
        invoices={invoices}
        activeEmail={contactFilter}
        onFilter={setContactFilter}
        onChanged={load}
      />

      <UploadCard onUploaded={load} />
    </main>
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
    <div className="mt-8 flex flex-wrap items-center gap-2">
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

function ServerCard({
  initialUrl,
  onSaved,
  onCancel,
}: {
  initialUrl: string | null;
  onSaved: (remote: RemoteInfo) => void;
  onCancel?: () => void;
}) {
  const [url, setUrl] = useState(initialUrl ?? DEFAULT_SERVER_URL);
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/local/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remoteUrl: url, remoteToken: token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't save");
        return;
      }
      onSaved({ url: data.remoteUrl, configured: data.remoteConfigured });
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-6 p-5">
      <h2 className="text-lg font-semibold text-ink">Connect to your server</h2>
      <p className="mt-1 text-sm text-dim">
        Invoices submitted through your links are pulled from the website into
        this library. Generate a sync token on the website under{" "}
        <span className="font-medium text-ink">/admin → Local sync</span> and
        paste it here.
      </p>
      <form onSubmit={save} className="mt-4 space-y-4" noValidate>
        <div>
          <Label htmlFor="server-url">Server URL</Label>
          <Input
            id="server-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={DEFAULT_SERVER_URL}
          />
        </div>
        <div>
          <Label htmlFor="server-token">Sync token</Label>
          <Input
            id="server-token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="mis_…"
            className="font-mono text-sm"
            autoComplete="off"
          />
        </div>
        {error ? <Banner tone="error">{error}</Banner> : null}
        <div className="flex items-center gap-2">
          <Button
            type="submit"
            disabled={busy || !url.trim() || !token.trim()}
            className="w-auto px-5 py-2.5 text-sm"
          >
            {busy ? "Saving…" : "Save connection"}
          </Button>
          {onCancel ? (
            <Button
              type="button"
              onClick={onCancel}
              variant="ghost"
              className="w-auto px-4 py-2.5 text-sm"
            >
              Cancel
            </Button>
          ) : null}
        </div>
      </form>
    </Card>
  );
}

function FolderPicker({
  initialPath,
  onChosen,
  onCancel,
}: {
  initialPath: string | null;
  onChosen: (dir: string) => void;
  onCancel?: () => void;
}) {
  const [current, setCurrent] = useState<string | null>(initialPath);
  const [parent, setParent] = useState<string | null>(null);
  const [dirs, setDirs] = useState<string[]>([]);
  const [home, setHome] = useState<string | null>(null);
  const [typed, setTyped] = useState(initialPath ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const browse = useCallback((path?: string, attempt = 0) => {
    const q = path ? `?path=${encodeURIComponent(path)}` : "";
    fetch(`/api/local/browse${q}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) {
          setError(d.error ?? "Can't open that folder");
          return;
        }
        setError(null);
        setCurrent(d.path);
        setTyped(d.path);
        setParent(d.parent);
        setHome(d.home);
        setDirs(d.dirs ?? []);
      })
      .catch(() => {
        // A dev-server cold start can drop the first fetch — retry briefly
        // instead of leaving the folder list empty.
        if (attempt < 5) setTimeout(() => browse(path, attempt + 1), 800);
        else setError("Couldn't load the folder list — check the app is still running.");
      });
  }, []);

  useEffect(() => {
    browse(initialPath ?? undefined);
  }, [browse, initialPath]);

  async function saveFolder(p: string) {
    if (!p.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/local/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: p }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't use that folder");
        return;
      }
      onChosen(data.invoiceDir);
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  // Opens the OS's real Finder/Explorer folder dialog. Inside the desktop
  // app this goes through Electron's dialog API (no extra permissions);
  // in a plain browser it falls back to a server-spawned dialog — local mode
  // runs on this machine either way. Picking a folder saves it.
  async function browseNative() {
    // Breadcrumbs kept on window so a debugger can read them after the fact.
    const log = (msg: string) => {
      console.log("[browse]", msg);
      const w = window as unknown as { __browseLog?: string[] };
      (w.__browseLog = w.__browseLog ?? []).push(`${new Date().toISOString()} ${msg}`);
    };
    log("clicked");
    setBusy(true);
    setError(null);
    try {
      const electronPick = (
        window as unknown as {
          wondervoice?: { pickFolder: () => Promise<string | null> };
        }
      ).wondervoice?.pickFolder;
      log(`electron bridge: ${electronPick ? "available" : "absent"}`);
      if (electronPick) {
        const picked = await electronPick();
        log(`dialog returned: ${picked}`);
        if (picked) await saveFolder(picked);
        return;
      }
      log("falling back to server-side dialog");

      const res = await fetch("/api/local/pick-folder", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't open the system folder dialog");
        return;
      }
      if (data.canceled) return;
      await saveFolder(data.path);
    } catch (err) {
      console.error("[browse] failed:", err);
      setError(
        err instanceof Error && err.message
          ? `Folder dialog failed: ${err.message}`
          : "Folder dialog failed — try typing the path below instead.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-5 p-5">
      <Button onClick={browseNative} disabled={busy} className="w-auto px-5 py-2.5 text-sm">
        {busy ? "Waiting…" : "Browse for a folder…"}
      </Button>
      <p className="mt-2 text-xs text-muted">
        Opens your system&apos;s folder picker (check your desktop if you
        don&apos;t see it). Or type a path / navigate below.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          browse(typed);
        }}
        className="mt-4 flex items-center gap-2"
      >
        <Input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="/Users/you/Google Drive/Invoices  (or ~/Invoices)"
          className="font-mono text-sm"
        />
        <Button type="submit" variant="secondary" className="w-auto px-4 py-2.5 text-sm">
          Go
        </Button>
      </form>
      <p className="mt-2 text-xs text-muted">
        New folders are created for you.
      </p>

      <div className="mt-3 flex items-center gap-2 text-sm">
        <button
          type="button"
          onClick={() => parent && browse(parent)}
          disabled={!parent}
          className="rounded-lg px-2.5 py-1.5 font-medium text-dim hover:bg-elev hover:text-ink disabled:opacity-40"
        >
          ↑ Up
        </button>
        <button
          type="button"
          onClick={() => home && browse(home)}
          disabled={!home}
          className="rounded-lg px-2.5 py-1.5 font-medium text-dim hover:bg-elev hover:text-ink disabled:opacity-40"
        >
          ⌂ Home
        </button>
        <span className="min-w-0 truncate text-xs text-muted">{current}</span>
      </div>

      <div className="mt-2 max-h-64 overflow-y-auto rounded-[10px] border border-hair">
        {dirs.length === 0 ? (
          <p className="px-3 py-3 text-sm text-slate-400">No subfolders here.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {dirs.map((d) => (
              <li key={d}>
                <button
                  type="button"
                  onClick={() => current && browse(`${current}/${d}`)}
                  className="block w-full truncate px-3 py-2 text-left text-sm text-slate-700 hover:bg-elev"
                >
                  📁 {d}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error ? (
        <div className="mt-3">
          <Banner tone="error">{error}</Banner>
        </div>
      ) : null}

      <div className="mt-4 flex items-center gap-2">
        <Button
          onClick={() => saveFolder(typed)}
          disabled={busy || !typed.trim()}
          variant="secondary"
          className="w-auto px-5 py-2.5 text-sm"
        >
          {busy ? "Saving…" : "Use this folder"}
        </Button>
        {onCancel ? (
          <Button onClick={onCancel} variant="ghost" className="w-auto px-4 py-2.5 text-sm">
            Cancel
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

function InvoiceList({
  invoices,
  filtered,
  onChanged,
}: {
  invoices: LibraryEntry[];
  filtered: boolean;
  onChanged: () => void;
}) {
  if (invoices.length === 0) {
    return (
      <Card className="mt-6 p-6 text-sm text-dim">
        {filtered
          ? "No invoices match the current filters."
          : "No invoices yet. Press “Sync now” to pull invoices submitted through your links, or upload one below."}
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
    <section className="mt-8 space-y-6">
      {years.map((year) => (
        <div key={year}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
            {year}
          </h2>
          <div className="space-y-3">
            {byYear.get(year)!.map((inv) => (
              <InvoiceRow key={inv.id} invoice={inv} onChanged={onChanged} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function InvoiceRow({
  invoice,
  onChanged,
}: {
  invoice: LibraryEntry;
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

  async function patch(body: { emailReceived?: boolean; paid?: boolean }) {
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
                  <>
                    <a
                      href={`/api/local/invoices/${invoice.id}/receipt`}
                      target="_blank"
                      rel="noreferrer"
                      className={`${flagButton} text-accent hover:bg-elev`}
                    >
                      View receipt
                    </a>
                  </>
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

const EMPTY_UPLOAD = {
  eventName: "",
  eventDate: "",
  bandmateName: "",
  contactEmail: "",
  invoiceNumber: "",
  amount: "",
  notes: "",
};

function UploadCard({ onUploaded }: { onUploaded: () => void }) {
  const [form, setForm] = useState(EMPTY_UPLOAD);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function update<K extends keyof typeof EMPTY_UPLOAD>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose a PDF file to upload.");
      return;
    }

    const body = new FormData();
    body.set("file", file);
    for (const [k, v] of Object.entries(form)) body.set(k, v);

    setLoading(true);
    try {
      const res = await fetch("/api/local/invoices", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Upload failed");
        return;
      }
      setSuccess(true);
      setForm(EMPTY_UPLOAD);
      if (fileRef.current) fileRef.current.value = "";
      onUploaded();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="mt-8 p-5">
      <h2 className="text-lg font-semibold text-ink">Add an invoice manually</h2>
      <p className="mt-1 text-sm text-dim">
        Drop in any invoice PDF — it gets filed into your folder and indexed.
        All details are optional.
      </p>
      <form onSubmit={onSubmit} className="mt-4 space-y-4" noValidate>
        <div>
          <Label htmlFor="upload-file">PDF file</Label>
          <input
            id="upload-file"
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-elev file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Event name</Label>
            <Input
              value={form.eventName}
              onChange={(e) => update("eventName", e.target.value)}
            />
          </div>
          <div>
            <Label>Event date</Label>
            <Input
              type="date"
              value={form.eventDate}
              onChange={(e) => update("eventDate", e.target.value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Who it&apos;s from</Label>
            <Input
              value={form.bandmateName}
              onChange={(e) => update("bandmateName", e.target.value)}
            />
          </div>
          <div>
            <Label hint="(links a contact)">Their email</Label>
            <Input
              type="email"
              value={form.contactEmail}
              onChange={(e) => update("contactEmail", e.target.value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Invoice #</Label>
            <Input
              value={form.invoiceNumber}
              onChange={(e) => update("invoiceNumber", e.target.value)}
            />
          </div>
          <div>
            <Label>Amount</Label>
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={form.amount}
              onChange={(e) => update("amount", e.target.value)}
              placeholder="0.00"
            />
          </div>
        </div>
        <div>
          <Label>Notes</Label>
          <Textarea
            rows={2}
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
          />
        </div>
        {error ? <Banner tone="error">{error}</Banner> : null}
        {success ? <Banner tone="success">Invoice added to your library.</Banner> : null}
        <Button type="submit" disabled={loading}>
          {loading ? "Adding…" : "Add invoice"}
        </Button>
      </form>
    </Card>
  );
}
