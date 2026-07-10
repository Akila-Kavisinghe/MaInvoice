"use client";

import { useCallback, useEffect, useState } from "react";

/** Broadcast after a successful sync so the Invoices list re-reads from disk. */
export const SYNCED_EVENT = "wondervoice:synced";

/**
 * Manual sync control for the library header, sitting next to the settings
 * gear. Sync only ever runs when clicked — never automatically. A red badge
 * (iOS-style) shows how many documents are waiting on the server; that count
 * is metadata-only (no downloads) and refreshes on mount and when the window
 * regains focus, so it's a cheap "notification", not a sync.
 */
export default function SyncButton() {
  const [configured, setConfigured] = useState(false);
  const [count, setCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);

  const refreshCount = useCallback(() => {
    fetch("/api/local/pending-count")
      .then((r) => (r.ok ? r.json() : { configured: false, count: 0 }))
      .then((d) => {
        setConfigured(!!d.configured);
        setCount(d.count ?? 0);
      })
      .catch(() => {});
  }, []);

  // Refresh the badge on mount and whenever the app regains focus.
  useEffect(() => {
    refreshCount();
    window.addEventListener("focus", refreshCount);
    return () => window.removeEventListener("focus", refreshCount);
  }, [refreshCount]);

  // Auto-dismiss the result toast.
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  async function sync() {
    setSyncing(true);
    setToast(null);
    try {
      const res = await fetch("/api/local/sync", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast({ tone: "error", message: data.error ?? "Sync failed" });
        return;
      }
      const pulled: number = data.pulled ?? 0;
      const base =
        pulled === 0
          ? "Nothing new to pull."
          : `Pulled ${pulled} invoice${pulled === 1 ? "" : "s"}.`;
      setToast({
        tone: data.errors?.length ? "error" : "success",
        message: data.errors?.length ? `${base} ${data.errors.join(" ")}` : base,
      });
      window.dispatchEvent(new CustomEvent(SYNCED_EVENT));
      refreshCount();
    } catch {
      setToast({ tone: "error", message: "Network error" });
    } finally {
      setSyncing(false);
    }
  }

  const title = !configured
    ? "Connect a server in Settings to sync"
    : count > 0
      ? `${count} document${count === 1 ? "" : "s"} waiting on the server — click to sync`
      : "Sync with the server";

  return (
    <>
      <button
        type="button"
        onClick={sync}
        disabled={syncing || !configured}
        aria-label={title}
        title={title}
        className="relative ml-1 rounded-lg p-2 text-dim hover:bg-elev hover:text-ink disabled:opacity-50"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={syncing ? "animate-spin" : ""}
        >
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <path d="M21 3v6h-6" />
        </svg>
        {configured && count > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-white">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </button>
      {toast ? (
        <div
          role="status"
          className={`fixed right-4 top-4 z-50 rounded-lg px-3 py-2 text-sm font-medium shadow-lg ${
            toast.tone === "error"
              ? "bg-danger/15 text-danger"
              : "bg-success/15 text-success"
          }`}
        >
          {toast.message}
        </div>
      ) : null}
    </>
  );
}
