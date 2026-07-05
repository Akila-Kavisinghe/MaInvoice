"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Banner, Button, Card, Input, Label, Textarea } from "@/components/ui";
import type { Contact, LibraryEntry } from "../lib-types";

const EMPTY: Omit<Contact, "createdAt"> = {
  email: "",
  name: "",
  address: "",
  phone: "",
  notes: "",
};

/**
 * View, create, and edit contact cards. Contacts are also created
 * automatically when an invoice arrives from a new sender or when you save a
 * client while generating an outbound invoice.
 */
export default function ContactsManager() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [invoices, setInvoices] = useState<LibraryEntry[]>([]);
  const [editing, setEditing] = useState<string | null>(null); // email being edited
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    fetch("/api/local/contacts")
      .then((r) => (r.ok ? r.json() : { contacts: [] }))
      .then((d) => setContacts(d.contacts ?? []))
      .catch(() => {});
    fetch("/api/local/invoices")
      .then((r) => (r.ok ? r.json() : { invoices: [] }))
      .then((d) => setInvoices(d.invoices ?? []))
      .catch(() => {});
  }, []);

  useEffect(load, [load]);

  const counts = new Map<string, number>();
  for (const inv of invoices) {
    if (inv.contactEmail) {
      counts.set(inv.contactEmail, (counts.get(inv.contactEmail) ?? 0) + 1);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-ink">Contacts</h1>
        {!adding ? (
          <Button
            onClick={() => {
              setAdding(true);
              setEditing(null);
            }}
            className="w-auto px-5 py-2.5 text-sm"
          >
            + New contact
          </Button>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-dim">
        Everyone you invoice or get invoiced by. New senders and saved clients
        are added automatically; you can also add and edit people here.
      </p>

      {adding ? (
        <ContactForm
          initial={EMPTY}
          emailLocked={false}
          onDone={() => {
            setAdding(false);
            load();
          }}
          onCancel={() => setAdding(false)}
        />
      ) : null}

      {contacts.length === 0 && !adding ? (
        <Card className="mt-6 p-6 text-sm text-dim">
          No contacts yet — they&apos;ll appear when invoices come in, or add
          one with &quot;New contact&quot;.
        </Card>
      ) : null}

      <div className="mt-6 space-y-3">
        {contacts.map((c) =>
          editing === c.email ? (
            <ContactForm
              key={c.email}
              initial={c}
              emailLocked
              onDone={() => {
                setEditing(null);
                load();
              }}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <ContactRow
              key={c.email}
              contact={c}
              invoiceCount={counts.get(c.email) ?? 0}
              onEdit={() => {
                setEditing(c.email);
                setAdding(false);
              }}
              onDeleted={load}
            />
          ),
        )}
      </div>
    </>
  );
}

function ContactRow({
  contact,
  invoiceCount,
  onEdit,
  onDeleted,
}: {
  contact: Contact;
  invoiceCount: number;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (
      !window.confirm(
        `Remove the contact card for ${contact.name}? Their invoices stay in the library.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `/api/local/contacts?email=${encodeURIComponent(contact.email)}`,
        { method: "DELETE" },
      );
      if (res.ok) onDeleted();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-800">{contact.name}</p>
          <p className="truncate text-xs text-slate-500">{contact.email}</p>
          {contact.phone ? (
            <p className="truncate text-xs text-slate-500">{contact.phone}</p>
          ) : null}
          {contact.address ? (
            <p className="mt-0.5 whitespace-pre-line text-xs text-slate-400">
              {contact.address}
            </p>
          ) : null}
          {contact.notes ? (
            <p className="mt-0.5 text-xs italic text-slate-400">{contact.notes}</p>
          ) : null}
          <p className="mt-1 text-xs text-slate-400">
            {invoiceCount === 0 ? (
              "No invoices yet"
            ) : (
              <Link href="/library" className="text-accent hover:underline">
                {invoiceCount} invoice{invoiceCount === 1 ? "" : "s"}
              </Link>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-accent hover:bg-elev"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {busy ? "…" : "Remove"}
          </button>
        </div>
      </div>
    </Card>
  );
}

function ContactForm({
  initial,
  emailLocked,
  onDone,
  onCancel,
}: {
  initial: Omit<Contact, "createdAt">;
  emailLocked: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    email: initial.email,
    name: initial.name,
    address: initial.address ?? "",
    phone: initial.phone ?? "",
    notes: initial.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function update(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/local/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't save");
        return;
      }
      onDone();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-6 p-5">
      <h2 className="text-lg font-semibold text-ink">
        {emailLocked ? `Edit ${initial.name || initial.email}` : "New contact"}
      </h2>
      <form onSubmit={save} className="mt-4 space-y-4" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => update("name", e.target.value)} />
          </div>
          <div>
            <Label hint={emailLocked ? "(identifies the contact)" : undefined}>Email</Label>
            <Input
              type="email"
              value={form.email}
              disabled={emailLocked}
              onChange={(e) => update("email", e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label hint="(optional)">Address</Label>
          <Textarea
            rows={2}
            value={form.address}
            onChange={(e) => update("address", e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label hint="(optional)">Phone</Label>
            <Input value={form.phone} onChange={(e) => update("phone", e.target.value)} />
          </div>
        </div>
        <div>
          <Label hint="(optional)">Notes</Label>
          <Textarea
            rows={2}
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
          />
        </div>
        {error ? <Banner tone="error">{error}</Banner> : null}
        <div className="flex items-center gap-2">
          <Button
            type="submit"
            disabled={busy || !form.email.trim()}
            className="w-auto px-5 py-2.5 text-sm"
          >
            {busy ? "Saving…" : "Save contact"}
          </Button>
          <Button
            type="button"
            onClick={onCancel}
            variant="ghost"
            className="w-auto px-4 py-2.5 text-sm"
          >
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
