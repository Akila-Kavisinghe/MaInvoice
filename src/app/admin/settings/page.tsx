"use client";

import { Card } from "@/components/ui";
import { useAdmin } from "../AdminShell";
import SyncCard from "../SyncCard";
import UsersCard from "../UsersCard";

/** Account, local-sync token, and (super admin) user management. */
export default function AdminSettingsPage() {
  const { data } = useAdmin();

  async function signOut() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* navigating away regardless */
    }
    window.location.href = "/admin";
  }

  return (
    <>
      <h1 className="text-2xl font-semibold text-ink">Settings</h1>

      <Card className="mt-5 p-5">
        <h2 className="text-lg font-semibold text-ink">Account</h2>
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-800">{data.user.email}</p>
            <p className="text-xs text-slate-400">
              {data.user.isSuperAdmin ? "Super admin" : "User"}
            </p>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-medium text-dim hover:bg-elev hover:text-ink"
          >
            Sign out
          </button>
        </div>
      </Card>

      <SyncCard hasToken={data.user.hasSyncToken} />

      {data.user.isSuperAdmin ? <UsersCard /> : null}
    </>
  );
}
