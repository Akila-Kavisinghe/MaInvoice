"use client";

import { useState } from "react";
import { Banner, Button, Card, Input, Label, Textarea } from "@/components/ui";
import { gmailWebUrl, mailtoUrl } from "@/lib/email-links";
import type { Contact, LibraryEntry } from "./lib-types";

const EMPTY = {
  clientName: "",
  clientEmail: "",
  clientAddress: "",
  eventName: "",
  eventDate: "",
  venue: "",
  description: "",
  amount: "",
  dueDate: "",
  paymentInstructions: "",
  notes: "",
};

const NEW_CLIENT = "__new__";

interface Created {
  entry: LibraryEntry;
  email: { to: string; subject: string; body: string } | null;
}

/** Generate an invoice YOU send to a client (outbound). */
export default function OutboundForm({
  contacts,
  eventNames = [],
  onCreated,
}: {
  contacts: Contact[];
  eventNames?: string[];
  onCreated: () => void;
}) {
  const [form, setForm] = useState(EMPTY);
  const [picked, setPicked] = useState(NEW_CLIENT);
  const [saveContact, setSaveContact] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [loading, setLoading] = useState(false);

  function update<K extends keyof typeof EMPTY>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  /** Selecting a contact autofills their saved details. */
  function pickContact(email: string) {
    setPicked(email);
    if (email === NEW_CLIENT) return;
    const c = contacts.find((x) => x.email === email);
    if (c) {
      setForm((f) => ({
        ...f,
        clientName: c.name,
        clientEmail: c.email,
        clientAddress: c.address ?? "",
      }));
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreated(null);
    setLoading(true);
    try {
      const res = await fetch("/api/local/outbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          amount: form.amount === "" ? undefined : Number(form.amount),
          saveContact,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const issues = data.issues
          ? Object.values(data.issues as Record<string, string[]>)
              .flat()
              .join(" ")
          : "";
        setError([data.error, issues].filter(Boolean).join(" — ") || "Failed");
        return;
      }
      setCreated(data);
      setForm(EMPTY);
      setPicked(NEW_CLIENT);
      onCreated();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="mt-6 p-5">
      <div>
        <h2 className="text-lg font-semibold text-ink">New outbound invoice</h2>
        <p className="mt-1 text-sm text-dim">
          An invoice from your business to a client — the PDF is generated and
          filed under Outbound.
        </p>
      </div>

      <form onSubmit={onSubmit} className="mt-4 space-y-4" noValidate>
        {contacts.length > 0 ? (
          <div>
            <Label>Bill to</Label>
            <select
              value={picked}
              onChange={(e) => pickContact(e.target.value)}
              className="w-full rounded-[10px] border border-hair bg-elev px-3.5 py-3 text-ink outline-none transition focus:border-accent"
            >
              <option value={NEW_CLIENT}>New client…</option>
              {contacts.map((c) => (
                <option key={c.email} value={c.email}>
                  {c.name} ({c.email})
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Client / venue name</Label>
            <Input
              value={form.clientName}
              onChange={(e) => update("clientName", e.target.value)}
              placeholder="City Jazz Festival"
            />
          </div>
          <div>
            <Label hint="(optional)">Client email</Label>
            <Input
              type="email"
              value={form.clientEmail}
              onChange={(e) => update("clientEmail", e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label hint="(optional)">Client address</Label>
          <Textarea
            rows={2}
            value={form.clientAddress}
            onChange={(e) => update("clientAddress", e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2.5 text-sm text-slate-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300"
            checked={saveContact}
            onChange={(e) => setSaveContact(e.target.checked)}
          />
          Save this client to my contacts (autofills next time)
        </label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label hint="(optional)">Event name</Label>
            <Input
              value={form.eventName}
              onChange={(e) => update("eventName", e.target.value)}
              list="outbound-event-names"
            />
            <datalist id="outbound-event-names">
              {eventNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>
          <div>
            <Label hint="(optional)">Event date</Label>
            <Input
              type="date"
              value={form.eventDate}
              onChange={(e) => update("eventDate", e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label>Description</Label>
          <Input
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            placeholder="Live performance — 2 sets"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Amount</Label>
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
                value={form.amount}
                onChange={(e) => update("amount", e.target.value)}
                placeholder="0.00"
              />
            </div>
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
        <div>
          <Label hint="(optional)">Payment instructions</Label>
          <Textarea
            rows={2}
            value={form.paymentInstructions}
            onChange={(e) => update("paymentInstructions", e.target.value)}
            placeholder="e.g. e-Transfer to wondermachine@…"
          />
        </div>

        {error ? <Banner tone="error">{error}</Banner> : null}
        {created ? <CreatedBanner created={created} /> : null}

        <Button
          type="submit"
          disabled={loading || !form.clientName || !form.description || !form.amount}
          className="w-full"
        >
          {loading ? "Generating…" : "Generate invoice"}
        </Button>
      </form>
    </Card>
  );
}

function CreatedBanner({ created }: { created: Created }) {
  const email = created.email;
  return (
    <div className="mt-3 space-y-2">
      <Banner tone="success">
        Invoice {created.entry.invoiceNumber} created and filed under Outbound.
      </Banner>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <a
          href={`/api/local/invoices/${created.entry.id}`}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg px-2.5 py-1.5 font-medium text-accent hover:bg-elev"
        >
          View PDF
        </a>
        {email ? (
          <>
            <a
              href={gmailWebUrl(email)}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg px-2.5 py-1.5 font-medium text-accent hover:bg-elev"
            >
              Open in Gmail
            </a>
            <a
              href={mailtoUrl(email)}
              className="rounded-lg px-2.5 py-1.5 font-medium text-accent hover:bg-elev"
            >
              Open mail app
            </a>
            <span className="text-xs text-muted">
              (attach the PDF before sending — browsers can&apos;t do it for you)
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}
