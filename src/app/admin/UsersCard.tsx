"use client";

import { useCallback, useEffect, useState } from "react";
import { Banner, Button, Card, Input, Label } from "@/components/ui";

interface AllowedUser {
  email: string;
  addedAt: string;
  addedBy: string;
}

/** Super-admin-only: manage which Google accounts may use the platform. */
export default function UsersCard() {
  const [users, setUsers] = useState<AllowedUser[]>([]);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    fetch("/api/admin/users")
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((d) => setUsers(d.users ?? []))
      .catch(() => {});
  }, []);

  useEffect(load, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not add user");
        return;
      }
      setEmail("");
      load();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function remove(target: string) {
    if (
      !window.confirm(
        `Remove ${target}? They will be signed out and their local app will stop syncing.`,
      )
    ) {
      return;
    }
    const res = await fetch(
      `/api/admin/users?email=${encodeURIComponent(target)}`,
      { method: "DELETE" },
    );
    if (res.ok) load();
  }

  return (
    <Card className="mt-8 p-5">
      <h2 className="text-lg font-semibold text-ink">Authorized users</h2>
      <p className="mt-1 text-sm text-dim">
        Google accounts allowed to sign in and run their own invoice links.
        You&apos;re the super admin — you&apos;re always allowed.
      </p>

      <form onSubmit={add} className="mt-4 flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <Label htmlFor="new-user-email">Google email</Label>
          <Input
            id="new-user-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="friend@gmail.com"
          />
        </div>
        {/* h matches the input exactly: py-3 + text-base line + 1px borders = 50px */}
        <Button
          type="submit"
          disabled={loading || !email}
          className="h-[50px] w-auto shrink-0 px-5 py-0"
        >
          {loading ? "Adding…" : "Add"}
        </Button>
      </form>
      {error ? (
        <div className="mt-3">
          <Banner tone="error">{error}</Banner>
        </div>
      ) : null}

      {users.length > 0 ? (
        <ul className="mt-4 space-y-2 border-t border-slate-100 pt-4">
          {users.map((u) => (
            <li key={u.email} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800">{u.email}</p>
                <p className="text-xs text-slate-400">
                  Added{" "}
                  {new Date(u.addedAt).toLocaleDateString("en-CA", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(u.email)}
                className="shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 border-t border-slate-100 pt-4 text-sm text-slate-400">
          No other users yet.
        </p>
      )}
    </Card>
  );
}
