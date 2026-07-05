"use client";

import { useRef, useState } from "react";
import { Banner, Button, Card, Input, Label, Textarea } from "@/components/ui";

const EMPTY_UPLOAD = {
  eventName: "",
  eventDate: "",
  bandmateName: "",
  contactEmail: "",
  invoiceNumber: "",
  amount: "",
  notes: "",
};

/** Manually file an invoice PDF you already have (inbound). */
export default function UploadCard({ onUploaded }: { onUploaded: () => void }) {
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
    <Card className="mt-6 p-5">
      <h2 className="text-lg font-semibold text-ink">Upload an invoice PDF</h2>
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
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Adding…" : "Add invoice"}
        </Button>
      </form>
    </Card>
  );
}
