"use client";

import { useEffect, useState } from "react";
import {
  Banner,
  Button,
  Card,
  FieldError,
  Input,
  Label,
  Logo,
  Textarea,
} from "@/components/ui";
import { gigCreateSchema } from "@/lib/validation";
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

type View = "loading" | "login" | "app";

export default function AdminPage() {
  const [view, setView] = useState<View>("loading");

  useEffect(() => {
    // Probe auth: the links endpoint is admin-only.
    fetch("/api/admin/links")
      .then((r) => setView(r.ok ? "app" : "login"))
      .catch(() => setView("login"));
  }, []);

  if (view === "loading") {
    return (
      <main className="mx-auto flex min-h-screen max-w-md items-center justify-center px-4 text-slate-400">
        Loading…
      </main>
    );
  }

  return view === "login" ? (
    <AdminLogin onSuccess={() => setView("app")} />
  ) : (
    <AdminApp />
  );
}

function AdminLogin({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) return onSuccess();
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Login failed");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <Logo className="mb-6" />
      <Card className="p-7">
        <h1 className="text-xl font-semibold text-ink">Admin sign in</h1>
        <p className="mt-1 text-sm text-dim">
          Use your admin password to create invoice links.
        </p>
        <form onSubmit={onSubmit} className="mt-5 space-y-4">
          <div>
            <Label htmlFor="adminpw">Admin password</Label>
            <Input
              id="adminpw"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </div>
          {error ? <Banner tone="error">{error}</Banner> : null}
          <Button type="submit" disabled={loading || !password}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </Card>
    </main>
  );
}

const EMPTY = {
  payeeName: "",
  payeeContact: "",
  payeeEmail: "",
  payeeAddress: "",
  payeePhone: "",
  eventName: "",
  eventDate: "",
  venue: "",
  paymentDescription: "",
  amountLocked: false,
  defaultAmount: "",
  dueDate: "",
  notes: "",
};

function AdminApp() {
  const [form, setForm] = useState<typeof EMPTY>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [links, setLinks] = useState<LinkRow[]>([]);

  function loadLinks() {
    fetch("/api/admin/links")
      .then((r) => (r.ok ? r.json() : { gigs: [], defaults: null }))
      .then((d) => {
        setLinks(d.gigs ?? []);
        // Prefill the business fields from env defaults (only when still empty,
        // so we never clobber what the admin is typing).
        const def = d.defaults;
        if (def) {
          setForm((f) => ({
            ...f,
            payeeName: f.payeeName || def.name || "",
            payeeContact: f.payeeContact || def.contact || "",
            payeeEmail: f.payeeEmail || def.email || "",
            payeeAddress: f.payeeAddress || def.address || "",
            payeePhone: f.payeePhone || def.phone || "",
          }));
        }
      })
      .catch(() => {});
  }

  useEffect(loadLinks, []);

  function update<K extends keyof typeof EMPTY>(key: K, value: string | boolean) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setCreated(null);

    const candidate = {
      ...form,
      defaultAmount: form.defaultAmount === "" ? undefined : Number(form.defaultAmount),
    };
    const parsed = gigCreateSchema.safeParse(candidate);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries(fieldErrors)) {
        if (v && v[0]) next[k] = v[0];
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const res = await fetch("/api/admin/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(data.error ?? "Could not create link");
        return;
      }
      setCreated(data.url);
      setForm(EMPTY);
      loadLinks();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setSubmitError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <Logo className="mb-6" />
      <h1 className="text-2xl font-semibold text-ink">Create an invoice link</h1>
      <p className="mt-1 text-sm text-dim">
        Fill in the shared gig details once, then send the link to your bandmate.
      </p>

      {created ? (
        <div className="mt-5">
          <Banner tone="success">Link created! Copy and send it to your bandmate.</Banner>
          <CopyField value={created} />
        </div>
      ) : null}

      <Card className="mt-5 p-5">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <SectionTitle>Your details (the band)</SectionTitle>
          <p className="-mt-2 text-xs text-slate-400">
            Prefilled from your saved business info — edit if needed.
          </p>
          <F label="Business name" err={errors.payeeName}>
            <Input value={form.payeeName} onChange={(e) => update("payeeName", e.target.value)} />
          </F>
          <F label="Contact name" err={errors.payeeContact} hint="(optional)">
            <Input
              value={form.payeeContact}
              onChange={(e) => update("payeeContact", e.target.value)}
            />
          </F>
          <F label="Your email" err={errors.payeeEmail} hint="(invoices are sent here)">
            <Input
              type="email"
              value={form.payeeEmail}
              onChange={(e) => update("payeeEmail", e.target.value)}
            />
          </F>
          <F label="Your address" err={errors.payeeAddress} hint="(optional)">
            <Textarea
              rows={2}
              value={form.payeeAddress}
              onChange={(e) => update("payeeAddress", e.target.value)}
            />
          </F>
          <F label="Phone" err={errors.payeePhone} hint="(optional)">
            <Input
              type="tel"
              value={form.payeePhone}
              onChange={(e) => update("payeePhone", e.target.value)}
            />
          </F>

          <SectionTitle>Event</SectionTitle>
          <F label="Gig / event name" err={errors.eventName}>
            <Input value={form.eventName} onChange={(e) => update("eventName", e.target.value)} />
          </F>
          <div className="grid grid-cols-2 gap-3">
            <F label="Event date" err={errors.eventDate}>
              <Input
                type="date"
                value={form.eventDate}
                onChange={(e) => update("eventDate", e.target.value)}
              />
            </F>
            <F label="Due date" err={errors.dueDate} hint="(optional)">
              <Input
                type="date"
                value={form.dueDate}
                onChange={(e) => update("dueDate", e.target.value)}
              />
            </F>
          </div>
          <F label="Venue / location" err={errors.venue} hint="(optional)">
            <Input value={form.venue} onChange={(e) => update("venue", e.target.value)} />
          </F>

          <SectionTitle>Payment</SectionTitle>
          <F label="Payment description" err={errors.paymentDescription}>
            <Input
              value={form.paymentDescription}
              onChange={(e) => update("paymentDescription", e.target.value)}
              placeholder="Live performance — 2 sets"
            />
          </F>
          <F label="Default amount" err={errors.defaultAmount} hint="(optional)">
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                $
              </span>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                className="pl-7"
                value={form.defaultAmount}
                onChange={(e) => update("defaultAmount", e.target.value)}
                placeholder="0.00"
              />
            </div>
          </F>
          <label className="flex items-center gap-2.5 text-sm text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300"
              checked={form.amountLocked}
              onChange={(e) => update("amountLocked", e.target.checked)}
            />
            Lock the amount (bandmate can&apos;t change it)
          </label>

          <F label="Notes / payment instructions" err={errors.notes} hint="(optional)">
            <Textarea
              rows={3}
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              placeholder="e.g. Pays within 14 days by e-Transfer."
            />
          </F>

          {submitError ? <Banner tone="error">{submitError}</Banner> : null}

          <Button type="submit" disabled={loading}>
            {loading ? "Creating…" : "Create link"}
          </Button>
        </form>
      </Card>

      {links.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Existing links
          </h2>
          <div className="space-y-3">
            {links.map((l) => (
              <Card key={l.token} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-800">{l.eventName}</p>
                    <p className="text-xs text-slate-500">{formatDate(l.eventDate)}</p>
                  </div>
                  <RevokeButton token={l.token} eventName={l.eventName} onRevoked={loadLinks} />
                </div>
                <CopyField value={l.url} compact />
                <SubmissionsTable submissions={l.submissions} />
              </Card>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
      {children}
    </h3>
  );
}

function F({
  label,
  err,
  hint,
  children,
}: {
  label: string;
  err?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label hint={hint}>{label}</Label>
      {children}
      <FieldError message={err} />
    </div>
  );
}

function SubmissionsTable({ submissions }: { submissions: Submission[] }) {
  const total = submissions.reduce((sum, s) => sum + s.amount, 0);
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
                <th className="pb-1 pr-3 font-medium">Bandmate</th>
                <th className="pb-1 pr-3 font-medium">Invoice #</th>
                <th className="pb-1 pr-3 text-right font-medium">Amount</th>
                <th className="pb-1 font-medium">When</th>
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
                  {formatMoney(total)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function RevokeButton({
  token,
  eventName,
  onRevoked,
}: {
  token: string;
  eventName: string;
  onRevoked: () => void;
}) {
  const [busy, setBusy] = useState(false);
  async function revoke() {
    if (!window.confirm(`Revoke the link for "${eventName}"? Anyone who still has it will lose access.`)) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/links?token=${encodeURIComponent(token)}`, {
        method: "DELETE",
      });
      if (res.ok) onRevoked();
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      onClick={revoke}
      disabled={busy}
      className="shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
    >
      {busy ? "Revoking…" : "Revoke"}
    </button>
  );
}

function CopyField({ value, compact }: { value: string; compact?: boolean }) {
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
