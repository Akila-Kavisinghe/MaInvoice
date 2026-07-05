"use client";

import { useState } from "react";
import { Banner, Button, Card } from "@/components/ui";

/**
 * Personal sync token for the local library app. The plaintext token is shown
 * exactly once after generating — only its hash is stored server-side.
 */
export default function SyncCard({ hasToken: initialHasToken }: { hasToken: boolean }) {
  const [hasToken, setHasToken] = useState(initialHasToken);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function generate() {
    if (
      hasToken &&
      !window.confirm(
        "Generating a new token replaces your current one — your local app will need the new token.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/sync-token", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not generate token");
        return;
      }
      setToken(data.token);
      setHasToken(true);
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!window.confirm("Revoke your sync token? Your local app will stop syncing.")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/sync-token", { method: "DELETE" });
      if (res.ok) {
        setHasToken(false);
        setToken(null);
      }
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be unavailable */
    }
  }

  return (
    <Card className="mt-8 p-5">
      <h2 className="text-lg font-semibold text-ink">Local sync</h2>
      <p className="mt-1 text-sm text-dim">
        Run the app on your own computer to organize invoices into a folder you
        control. Generate a token and put it in your local{" "}
        <code className="rounded bg-elev px-1 py-0.5 text-xs">.env.local</code> as{" "}
        <code className="rounded bg-elev px-1 py-0.5 text-xs">REMOTE_SYNC_TOKEN</code>.
      </p>

      {token ? (
        <div className="mt-4">
          <Banner tone="success">
            Copy this token now — it won&apos;t be shown again.
          </Banner>
          <div className="mt-3 flex items-center gap-2">
            <input
              readOnly
              value={token}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full truncate rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700"
            />
            <button
              type="button"
              onClick={copy}
              className="shrink-0 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="mt-3">
          <Banner tone="error">{error}</Banner>
        </div>
      ) : null}

      <div className="mt-4 flex items-center gap-2">
        <Button
          onClick={generate}
          disabled={busy}
          variant="secondary"
          className="w-auto px-5 py-2.5 text-sm"
        >
          {busy ? "Working…" : hasToken ? "Generate new token" : "Generate sync token"}
        </Button>
        {hasToken ? (
          <button
            type="button"
            onClick={revoke}
            disabled={busy}
            className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Revoke
          </button>
        ) : null}
      </div>
    </Card>
  );
}
