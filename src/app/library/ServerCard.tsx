"use client";

import { useState } from "react";
import { Banner, Button, Card, Input, Label } from "@/components/ui";
import type { RemoteInfo } from "./lib-types";

export const DEFAULT_SERVER_URL = "https://mainvoice-sigma.vercel.app";

/** Server connection: where synced invoices and new links come from. */
export default function ServerCard({
  initialUrl,
  configured,
  onSaved,
}: {
  initialUrl: string | null;
  configured: boolean;
  onSaved: (remote: RemoteInfo) => void;
}) {
  const [url, setUrl] = useState(initialUrl ?? DEFAULT_SERVER_URL);
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
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
      setSaved(true);
      setToken("");
      onSaved({ url: data.remoteUrl, configured: data.remoteConfigured });
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-6 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">Server connection</h2>
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${
            configured ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
          }`}
        >
          {configured ? "Connected" : "Not connected"}
        </span>
      </div>
      <p className="mt-1 text-sm text-dim">
        Invoices submitted through your links are pulled from the website into
        this library, and new links are created there. Generate a sync token on
        the website under <span className="font-medium text-ink">/admin → Local sync</span>.
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
          <Label htmlFor="server-token" hint={configured ? "(saved — enter a new one to replace)" : undefined}>
            Sync token
          </Label>
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
        {saved ? <Banner tone="success">Server connection saved.</Banner> : null}
        <Button
          type="submit"
          disabled={busy || !url.trim() || !token.trim()}
          className="w-auto px-5 py-2.5 text-sm"
        >
          {busy ? "Saving…" : "Save connection"}
        </Button>
      </form>
    </Card>
  );
}
