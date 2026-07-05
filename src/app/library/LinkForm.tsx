"use client";

import { useCallback, useEffect, useState } from "react";
import { Banner, Button, Card, Input, Label, Textarea } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";
import type { BusinessInfo } from "./lib-types";

interface LinkRow {
  token: string;
  eventName: string;
  eventDate: string;
  createdAt: string;
  url: string;
  submissions: { bandmateName: string; amount: number }[];
}

const EMPTY = {
  eventName: "",
  eventDate: "",
  venue: "",
  paymentDescription: "",
  defaultAmount: "",
  amountLocked: false,
  dueDate: "",
  notes: "",
};

/**
 * Create bandmate invoice links from the local app. The link itself lives on
 * the deployed server (bandmates need a public URL) — this goes through the
 * sync token, so no browser sign-in is needed here.
 */
export default function LinkForm({
  business,
  remoteConfigured,
}: {
  business: BusinessInfo;
  remoteConfigured: boolean;
}) {
  const [form, setForm] = useState(EMPTY);
  const [links, setLinks] = useState<LinkRow[] | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const loadLinks = useCallback(() => {
    fetch("/api/local/links")
      .then((r) => (r.ok ? r.json() : { links: null }))
      .then((d) => setLinks(d.links ?? null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (remoteConfigured) loadLinks();
  }, [remoteConfigured, loadLinks]);

  function update<K extends keyof typeof EMPTY>(key: K, value: string | boolean) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreated(null);

    if (!business.name || !business.email) {
      setError("Set your business details first — they prefill the link.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/local/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payeeName: business.name,
          payeeContact: "",
          payeeEmail: business.email,
          payeeAddress: business.address,
          payeePhone: business.phone,
          eventName: form.eventName,
          eventDate: form.eventDate,
          venue: form.venue,
          paymentDescription: form.paymentDescription,
          amountLocked: form.amountLocked,
          defaultAmount: form.defaultAmount === "" ? undefined : Number(form.defaultAmount),
          dueDate: form.dueDate || undefined,
          notes: form.notes,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const issues = data.issues
          ? Object.values(data.issues as Record<string, string[]>).flat().join(" ")
          : "";
        setError([data.error, issues].filter(Boolean).join(" — ") || "Failed");
        return;
      }
      setCreated(data.url);
      setForm(EMPTY);
      loadLinks();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard may be unavailable */
    }
  }

  if (!remoteConfigured) {
    return (
      <Card className="mt-6 p-5">
        <h2 className="text-lg font-semibold text-ink">New invoice link</h2>
        <Banner tone="info">
          Connect to your server first (Settings → Server connection) — links
          are created there so bandmates can reach them.
        </Banner>
      </Card>
    );
  }

  return (
    <Card className="mt-6 p-5">
      <div>
        <h2 className="text-lg font-semibold text-ink">New invoice link</h2>
        <p className="mt-1 text-sm text-dim">
          Created on your server; send it to a bandmate so they can submit
          their invoice. Your business details are the &quot;Bill to&quot;.
        </p>
      </div>

      {created ? (
        <div className="mt-4">
          <Banner tone="success">Link created! Copy and send it to your bandmate.</Banner>
          <div className="mt-2 flex items-center gap-2">
            <input
              readOnly
              value={created}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full truncate rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700"
            />
            <button
              type="button"
              onClick={() => copy(created)}
              className="shrink-0 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              {copied === created ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="mt-4 space-y-4" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Gig / event name</Label>
            <Input value={form.eventName} onChange={(e) => update("eventName", e.target.value)} />
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
        <div>
          <Label hint="(optional)">Venue / location</Label>
          <Input value={form.venue} onChange={(e) => update("venue", e.target.value)} />
        </div>
        <div>
          <Label>Payment description</Label>
          <Input
            value={form.paymentDescription}
            onChange={(e) => update("paymentDescription", e.target.value)}
            placeholder="Live performance — 2 sets"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label hint="(optional)">Default amount</Label>
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={form.defaultAmount}
              onChange={(e) => update("defaultAmount", e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div>
            <Label hint="(optional)">Due date</Label>
            <Input
              type="date"
              value={form.dueDate}
              onChange={(e) => update("dueDate", e.target.value)}
            />
          </div>
        </div>
        <label className="flex items-center gap-2.5 text-sm text-slate-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300"
            checked={form.amountLocked}
            onChange={(e) => update("amountLocked", e.target.checked)}
          />
          Lock the amount (bandmate can&apos;t change it)
        </label>
        <div>
          <Label hint="(optional)">Notes / payment instructions</Label>
          <Textarea rows={2} value={form.notes} onChange={(e) => update("notes", e.target.value)} />
        </div>

        {error ? <Banner tone="error">{error}</Banner> : null}

        <Button
          type="submit"
          disabled={loading || !form.eventName || !form.eventDate || !form.paymentDescription}
        >
          {loading ? "Creating…" : "Create link"}
        </Button>
      </form>

      {links && links.length > 0 ? (
        <div className="mt-6 border-t border-slate-100 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Your links
          </h3>
          <ul className="mt-2 space-y-2">
            {links.map((l) => (
              <li key={l.token} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {l.eventName}
                    <span className="ml-2 text-xs font-normal text-slate-400">
                      {formatDate(l.eventDate)} · {l.submissions.length} submission
                      {l.submissions.length === 1 ? "" : "s"}
                      {l.submissions.length > 0
                        ? ` · ${formatMoney(l.submissions.reduce((s, x) => s + x.amount, 0))}`
                        : ""}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => copy(l.url)}
                  className="shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-medium text-accent hover:bg-elev"
                >
                  {copied === l.url ? "Copied" : "Copy link"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
