"use client";

import { useCallback, useEffect, useState } from "react";
import { Banner, Button, Card, Input } from "@/components/ui";

/** Choose the invoice folder: native OS dialog, typed path, or in-page browser. */
export default function FolderPicker({
  initialPath,
  onChosen,
  onCancel,
}: {
  initialPath: string | null;
  onChosen: (dir: string) => void;
  onCancel?: () => void;
}) {
  const [current, setCurrent] = useState<string | null>(initialPath);
  const [parent, setParent] = useState<string | null>(null);
  const [dirs, setDirs] = useState<string[]>([]);
  const [home, setHome] = useState<string | null>(null);
  const [typed, setTyped] = useState(initialPath ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const browse = useCallback((path?: string, attempt = 0) => {
    const q = path ? `?path=${encodeURIComponent(path)}` : "";
    fetch(`/api/local/browse${q}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) {
          setError(d.error ?? "Can't open that folder");
          return;
        }
        setError(null);
        setCurrent(d.path);
        setTyped(d.path);
        setParent(d.parent);
        setHome(d.home);
        setDirs(d.dirs ?? []);
      })
      .catch(() => {
        // A dev-server cold start can drop the first fetch — retry briefly
        // instead of leaving the folder list empty.
        if (attempt < 5) setTimeout(() => browse(path, attempt + 1), 800);
        else setError("Couldn't load the folder list — check the app is still running.");
      });
  }, []);

  useEffect(() => {
    browse(initialPath ?? undefined);
  }, [browse, initialPath]);

  async function saveFolder(p: string) {
    if (!p.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/local/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: p }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't use that folder");
        return;
      }
      onChosen(data.invoiceDir);
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  // Opens the OS's real Finder/Explorer folder dialog. Inside the desktop
  // app this goes through Electron's dialog API (no extra permissions);
  // in a plain browser it falls back to a server-spawned dialog — local mode
  // runs on this machine either way. Picking a folder saves it.
  async function browseNative() {
    setBusy(true);
    setError(null);
    try {
      const electronPick = (
        window as unknown as {
          wondervoice?: { pickFolder: () => Promise<string | null> };
        }
      ).wondervoice?.pickFolder;
      if (electronPick) {
        const picked = await electronPick();
        if (picked) await saveFolder(picked);
        return;
      }

      const res = await fetch("/api/local/pick-folder", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't open the system folder dialog");
        return;
      }
      if (data.canceled) return;
      await saveFolder(data.path);
    } catch (err) {
      console.error("[browse] failed:", err);
      setError(
        err instanceof Error && err.message
          ? `Folder dialog failed: ${err.message}`
          : "Folder dialog failed — try typing the path below instead.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-5 p-5">
      <Button onClick={browseNative} disabled={busy} className="w-auto px-5 py-2.5 text-sm">
        {busy ? "Waiting…" : "Browse for a folder…"}
      </Button>
      <p className="mt-2 text-xs text-muted">
        Opens your system&apos;s folder picker (check your desktop if you
        don&apos;t see it). Or type a path / navigate below.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          browse(typed);
        }}
        className="mt-4 flex items-center gap-2"
      >
        <Input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="/Users/you/Google Drive/Invoices  (or ~/Invoices)"
          className="font-mono text-sm"
        />
        <Button type="submit" variant="secondary" className="w-auto px-4 py-2.5 text-sm">
          Go
        </Button>
      </form>
      <p className="mt-2 text-xs text-muted">New folders are created for you.</p>

      <div className="mt-3 flex items-center gap-2 text-sm">
        <button
          type="button"
          onClick={() => parent && browse(parent)}
          disabled={!parent}
          className="rounded-lg px-2.5 py-1.5 font-medium text-dim hover:bg-elev hover:text-ink disabled:opacity-40"
        >
          ↑ Up
        </button>
        <button
          type="button"
          onClick={() => home && browse(home)}
          disabled={!home}
          className="rounded-lg px-2.5 py-1.5 font-medium text-dim hover:bg-elev hover:text-ink disabled:opacity-40"
        >
          ⌂ Home
        </button>
        <span className="min-w-0 truncate text-xs text-muted">{current}</span>
      </div>

      <div className="mt-2 max-h-64 overflow-y-auto rounded-[10px] border border-hair">
        {dirs.length === 0 ? (
          <p className="px-3 py-3 text-sm text-slate-400">No subfolders here.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {dirs.map((d) => (
              <li key={d}>
                <button
                  type="button"
                  onClick={() => current && browse(`${current}/${d}`)}
                  className="block w-full truncate px-3 py-2 text-left text-sm text-slate-700 hover:bg-elev"
                >
                  📁 {d}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error ? (
        <div className="mt-3">
          <Banner tone="error">{error}</Banner>
        </div>
      ) : null}

      <div className="mt-4 flex items-center gap-2">
        <Button
          onClick={() => saveFolder(typed)}
          disabled={busy || !typed.trim()}
          variant="secondary"
          className="w-auto px-5 py-2.5 text-sm"
        >
          {busy ? "Saving…" : "Use this folder"}
        </Button>
        {onCancel ? (
          <Button onClick={onCancel} variant="ghost" className="w-auto px-4 py-2.5 text-sm">
            Cancel
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
