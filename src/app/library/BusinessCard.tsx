"use client";

import { useState } from "react";
import { Banner, Button, Card, Input, Label, Textarea } from "@/components/ui";
import type { BusinessInfo } from "./lib-types";

/** The user's own business details — the "From" on outbound invoices. */
export default function BusinessCard({
  initial,
  onSaved,
  onCancel,
}: {
  initial: BusinessInfo;
  onSaved: (b: BusinessInfo) => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<BusinessInfo>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function update<K extends keyof BusinessInfo>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/local/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business: form }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't save");
        return;
      }
      onSaved(data.business);
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-6 p-5">
      <h2 className="text-lg font-semibold text-ink">Your business details</h2>
      <p className="mt-1 text-sm text-dim">
        Shown as the &quot;From&quot; on outbound invoices you generate.
      </p>
      <form onSubmit={save} className="mt-4 space-y-4" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Business name</Label>
            <Input value={form.name} onChange={(e) => update("name", e.target.value)} />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={form.email}
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
          <div>
            <Label hint="(optional)">Tax / HST #</Label>
            <Input
              value={form.taxNumber}
              onChange={(e) => update("taxNumber", e.target.value)}
            />
          </div>
        </div>
        {error ? <Banner tone="error">{error}</Banner> : null}
        <div className="flex items-center gap-2">
          <Button
            type="submit"
            disabled={busy || !form.name.trim() || !form.email.trim()}
            className="w-auto px-5 py-2.5 text-sm"
          >
            {busy ? "Saving…" : "Save details"}
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
