"use client";

import { useEffect, useState } from "react";
import {
  Banner,
  Button,
  Card,
  FieldError,
  Input,
  Label,
  Textarea,
} from "@/components/ui";
import { gigCreateSchema } from "@/lib/validation";
import { useAdmin } from "../AdminShell";
import { CopyField, SectionTitle } from "../components";

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

/** Create a prefilled, tokenized invoice link for a gig. */
export default function AdminCreatePage() {
  const { data, reload } = useAdmin();
  const [form, setForm] = useState<typeof EMPTY>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<string | null>(null);

  // Prefill the business fields from env defaults (only when still empty,
  // so we never clobber what the admin is typing).
  useEffect(() => {
    const def = data.defaults;
    if (!def) return;
    setForm((f) => ({
      ...f,
      payeeName: f.payeeName || def.name || "",
      payeeContact: f.payeeContact || def.contact || "",
      payeeEmail: f.payeeEmail || def.email || "",
      payeeAddress: f.payeeAddress || def.address || "",
      payeePhone: f.payeePhone || def.phone || "",
    }));
  }, [data.defaults]);

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
      const resData = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(resData.error ?? "Could not create link");
        return;
      }
      setCreated(resData.url);
      setForm(EMPTY);
      reload();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setSubmitError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h1 className="text-2xl font-semibold text-ink">Create an invoice link</h1>
      <p className="mt-1 text-sm text-dim">
        Fill in the shared details once, then send the link to whoever is invoicing you.
      </p>

      {created ? (
        <div className="mt-5">
          <Banner tone="success">Link created! Copy and send it to the person invoicing you.</Banner>
          <CopyField value={created} />
        </div>
      ) : null}

      <Card className="mt-5 p-5">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <SectionTitle>Your details (who gets billed)</SectionTitle>
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
            Lock the amount (the sender can&apos;t change it)
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

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Creating…" : "Create link"}
          </Button>
        </form>
      </Card>
    </>
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
