"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Banner,
  Button,
  Card,
  FieldError,
  Input,
  Label,
  Textarea,
} from "@/components/ui";
import { bandmateSchema } from "@/lib/validation";
import { formatDate, formatMoney, invoiceFilename } from "@/lib/format";
import {
  buildEmailParts,
  gmailWebUrl,
  mailtoUrl,
} from "@/lib/email-links";
import {
  clearProfile,
  loadProfile,
  PROFILE_FIELDS,
  saveProfile,
} from "@/lib/bandmate-profile";

interface GigPublic {
  payeeName: string;
  eventName: string;
  eventDate: string;
  venue?: string;
  paymentDescription: string;
  amountLocked: boolean;
  defaultAmount?: number;
  dueDate?: string;
  notes?: string;
}

interface GeneratedResult {
  pdfUrl: string;
  filename: string;
  bandmateName: string;
  bandmateEmail: string;
  invoiceNumber: string;
}

type Errors = Partial<Record<string, string>>;

export default function InvoiceForm({
  token,
  adminEmail,
  gig,
}: {
  token: string;
  adminEmail: string;
  gig: GigPublic;
}) {
  const [form, setForm] = useState({
    bandmateName: "",
    bandmateEmail: "",
    bandmateAddress: "",
    // Prefill with the band's default amount when one is set (locked or not).
    amount: gig.defaultAmount != null ? String(gig.defaultAmount) : "",
    taxNumber: "",
    paymentMethod: "",
    notes: "",
  });
  const [errors, setErrors] = useState<Errors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GeneratedResult | null>(null);
  const [saveDetails, setSaveDetails] = useState(false);
  const [prefilled, setPrefilled] = useState(false);

  // On mount, repopulate the reusable fields from this device's saved profile.
  useEffect(() => {
    const profile = loadProfile();
    if (!profile) return;
    setForm((f) => {
      const next = { ...f };
      for (const key of PROFILE_FIELDS) {
        if (!next[key] && profile[key]) next[key] = profile[key];
      }
      return next;
    });
    setSaveDetails(true);
    setPrefilled(true);
  }, []);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function forgetSavedDetails() {
    clearProfile();
    setSaveDetails(false);
    setPrefilled(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    const candidate = {
      ...form,
      amount: Number(form.amount),
    };
    const parsed = bandmateSchema.safeParse(candidate);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      const next: Errors = {};
      for (const [k, v] of Object.entries(fieldErrors)) {
        if (v && v[0]) next[k] = v[0];
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const res = await fetch(`/api/invoice/${token}/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSubmitError(data.error ?? "Could not generate the invoice.");
        return;
      }
      // Remember (or forget) the bandmate's reusable details on this device.
      if (saveDetails) {
        saveProfile({
          bandmateName: parsed.data.bandmateName,
          bandmateEmail: parsed.data.bandmateEmail,
          bandmateAddress: parsed.data.bandmateAddress ?? "",
          taxNumber: parsed.data.taxNumber ?? "",
          paymentMethod: parsed.data.paymentMethod ?? "",
        });
      } else {
        clearProfile();
      }

      const invoiceNumber = res.headers.get("X-Invoice-Number") ?? "";
      const blob = await res.blob();
      const pdfUrl = URL.createObjectURL(blob);
      setResult({
        pdfUrl,
        filename: invoiceFilename(parsed.data.bandmateName, gig.eventName, gig.eventDate),
        bandmateName: parsed.data.bandmateName,
        bandmateEmail: parsed.data.bandmateEmail,
        invoiceNumber,
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <SuccessView
        result={result}
        adminEmail={adminEmail}
        eventName={gig.eventName}
        eventDate={gig.eventDate}
        onEdit={() => {
          URL.revokeObjectURL(result.pdfUrl);
          setResult(null);
        }}
      />
    );
  }

  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <header className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">Your invoice details</h1>
        <p className="mt-1 text-sm text-slate-600">
          The gig info is already filled in. Just add your details and tap{" "}
          <span className="font-medium">Generate invoice</span>. A unique invoice
          number is added for you automatically.
        </p>
        <div className="mt-3">
          <Banner tone="info">
            Already sent one for this event? Generating again{" "}
            <span className="font-semibold">replaces your previous submission</span>{" "}
            — the band only keeps your most recent invoice, under the same invoice
            number.
          </Banner>
        </div>
      </header>

      {/* Prefilled gig summary (read-only) */}
      <Card className="mb-5 p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Gig details (from {gig.payeeName})
        </h2>
        <dl className="mt-3 space-y-1.5 text-sm">
          <SummaryRow label="Event" value={gig.eventName} />
          <SummaryRow label="Date" value={formatDate(gig.eventDate)} />
          {gig.venue ? <SummaryRow label="Venue" value={gig.venue} /> : null}
          <SummaryRow label="For" value={gig.paymentDescription} />
          {gig.dueDate ? <SummaryRow label="Due" value={formatDate(gig.dueDate)} /> : null}
          {gig.amountLocked && gig.defaultAmount != null ? (
            <SummaryRow label="Amount" value={`${formatMoney(gig.defaultAmount)} (fixed)`} />
          ) : null}
        </dl>
        {gig.notes ? (
          <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            {gig.notes}
          </p>
        ) : null}
      </Card>

      <Card className="p-5">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Your legal / business name" error={errors.bandmateName}>
            <Input
              value={form.bandmateName}
              onChange={(e) => update("bandmateName", e.target.value)}
              placeholder="Jane Doe"
              autoComplete="name"
            />
          </Field>

          <Field label="Your email" error={errors.bandmateEmail} hint="(you'll get a copy)">
            <Input
              type="email"
              inputMode="email"
              value={form.bandmateEmail}
              onChange={(e) => update("bandmateEmail", e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </Field>

          <Field label="Your address" error={errors.bandmateAddress} hint="(optional)">
            <Textarea
              rows={2}
              value={form.bandmateAddress}
              onChange={(e) => update("bandmateAddress", e.target.value)}
              placeholder="123 Main St, City, Province"
            />
          </Field>

          <Field
            label="Amount owed"
            error={errors.amount}
            hint={gig.amountLocked ? "(set by the band)" : undefined}
          >
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
                disabled={gig.amountLocked}
              />
            </div>
          </Field>

          <Field label="HST / tax number" error={errors.taxNumber} hint="(if applicable)">
            <Input
              value={form.taxNumber}
              onChange={(e) => update("taxNumber", e.target.value)}
              placeholder="123456789 RT0001"
            />
          </Field>

          <Field label="Payment method" error={errors.paymentMethod} hint="(optional)">
            <Input
              value={form.paymentMethod}
              onChange={(e) => update("paymentMethod", e.target.value)}
              placeholder="e-Transfer to you@example.com"
            />
          </Field>

          <Field label="Notes" error={errors.notes} hint="(optional)">
            <Textarea
              rows={2}
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              placeholder="Anything else you want on the invoice"
            />
          </Field>

          <div className="rounded-xl bg-slate-50 p-3.5 ring-1 ring-slate-200">
            <label className="flex items-start gap-2.5 text-sm text-slate-700">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-slate-300"
                checked={saveDetails}
                onChange={(e) => setSaveDetails(e.target.checked)}
              />
              <span>
                Save my details on this device for next time
                <span className="mt-0.5 block text-xs text-slate-400">
                  Name, email, address, tax # and payment method. Stays only in
                  this browser — never sent to the band.
                </span>
              </span>
            </label>
            {prefilled ? (
              <button
                type="button"
                onClick={forgetSavedDetails}
                className="mt-2 text-xs font-medium text-slate-500 underline hover:text-slate-700"
              >
                Forget saved details
              </button>
            ) : null}
          </div>

          {submitError ? <Banner tone="error">{submitError}</Banner> : null}

          <Button type="submit" disabled={loading}>
            {loading ? "Generating…" : "Generate invoice"}
          </Button>
        </form>
      </Card>

      {prefilled ? (
        <p className="mt-4 text-center text-xs text-slate-400">
          ✓ Prefilled from your saved details on this device.
        </p>
      ) : (
        <p className="mt-4 text-center text-xs text-slate-400">
          Your name, email, invoice number and amount are saved so the band can
          track invoices. Your address, tax number and notes appear only on the
          PDF and aren&apos;t stored.
        </p>
      )}
    </main>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-800">{value}</dd>
    </div>
  );
}

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label hint={hint}>{label}</Label>
      {children}
      <FieldError message={error} />
    </div>
  );
}

function SuccessView({
  result,
  adminEmail,
  eventName,
  eventDate,
  onEdit,
}: {
  result: GeneratedResult;
  adminEmail: string;
  eventName: string;
  eventDate: string;
  onEdit: () => void;
}) {
  const email = useMemo(
    () =>
      buildEmailParts({
        adminEmail,
        bandmateEmail: result.bandmateEmail,
        bandmateName: result.bandmateName,
        eventName,
        eventDate,
        invoiceNumber: result.invoiceNumber,
      }),
    [adminEmail, result, eventName, eventDate],
  );

  const [downloaded, setDownloaded] = useState(false);

  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <Card className="p-6">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-2xl">
            ✅
          </div>
          <h1 className="text-xl font-bold text-slate-900">Invoice ready</h1>
          {result.invoiceNumber ? (
            <p className="mt-1 text-sm font-medium text-slate-700">
              Invoice #{result.invoiceNumber}
            </p>
          ) : null}
          <p className="mt-1 text-sm text-slate-600">Two quick steps left.</p>
          <p className="mt-2 text-xs text-slate-400">
            This is now your current invoice for {eventName} — it replaces any
            earlier one you sent.
          </p>
        </div>

        {/* Step 1: download */}
        <div className="mt-6">
          <StepHeading n={1} title="Download the PDF" done={downloaded} />
          <a
            href={result.pdfUrl}
            download={result.filename}
            onClick={() => setDownloaded(true)}
            className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-base font-semibold text-white transition hover:bg-brand-700"
          >
            ⬇️ Download invoice
          </a>
          <p className="mt-1.5 truncate text-center text-xs text-slate-400">
            {result.filename}
          </p>
        </div>

        {/* Step 2: email */}
        <div className="mt-6">
          <StepHeading n={2} title="Open email & attach the PDF" />
          <Banner tone="info">
            Email can&apos;t attach the file for you. After it opens, tap the{" "}
            <span className="font-semibold">paperclip / attach</span> button and pick
            the PDF you just downloaded, then send.
          </Banner>

          <div className="mt-3 space-y-2.5">
            <a
              href={gmailWebUrl(email)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-base font-semibold text-slate-800 ring-1 ring-inset ring-slate-300 transition hover:bg-slate-50"
            >
              ✉️ Open in Gmail
            </a>
            <a
              href={mailtoUrl(email)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-base font-semibold text-slate-800 ring-1 ring-inset ring-slate-300 transition hover:bg-slate-50"
            >
              📱 Open default mail app
            </a>
          </div>

          <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            <p>
              <span className="text-slate-400">To:</span> {email.to}
            </p>
            <p>
              <span className="text-slate-400">Cc (you):</span> {email.cc}
            </p>
            <p className="mt-1">
              <span className="text-slate-400">Subject:</span> {email.subject}
            </p>
          </div>
        </div>

        <button
          onClick={onEdit}
          className="mt-6 w-full text-center text-sm font-medium text-slate-500 hover:text-slate-700"
        >
          ← Edit details / regenerate
        </button>
      </Card>
    </main>
  );
}

function StepHeading({ n, title, done }: { n: number; title: string; done?: boolean }) {
  return (
    <div className="mb-1 flex items-center gap-2">
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
          done ? "bg-emerald-100 text-emerald-700" : "bg-brand-100 text-brand-700"
        }`}
      >
        {done ? "✓" : n}
      </span>
      <h2 className="font-semibold text-slate-800">{title}</h2>
    </div>
  );
}
