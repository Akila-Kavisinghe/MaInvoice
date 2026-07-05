"use client";

import { useCallback, useEffect, useState } from "react";
import { Banner, Card } from "@/components/ui";
import ServerCard from "./ServerCard";

type Status = "checking" | "unconfigured" | "authorized" | "unauthorized" | "offline";

/**
 * Blocks the app unless the stored sync token validates against the server —
 * i.e. only users on the platform's allowlist can use the app. Connecting is
 * the unlock: enter the server URL + a sync token issued to an authorized
 * account. If the server is unreachable the app stays usable (your files are
 * your own); revoked/removed users are locked out on the next check.
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("checking");
  const [email, setEmail] = useState<string | null>(null);

  const check = useCallback((force = false) => {
    fetch(`/api/local/auth-status${force ? "?force=1" : ""}`)
      .then((r) => r.json())
      .then((d) => {
        setStatus(d.status ?? "offline");
        setEmail(d.email ?? null);
      })
      .catch(() => setStatus("offline"));
  }, []);

  useEffect(() => check(), [check]);

  if (status === "checking") {
    return <p className="py-16 text-center text-sm text-slate-400">Checking access…</p>;
  }

  if (status === "unconfigured" || status === "unauthorized") {
    return (
      <>
        <h1 className="text-2xl font-semibold text-ink">Connect your account</h1>
        <p className="mt-1 text-sm text-dim">
          This app is for authorized users of the invoicing platform.
        </p>
        {status === "unauthorized" ? (
          <div className="mt-4">
            <Banner tone="error">
              The server rejected your sync token — it may have been revoked, or
              your access was removed. Generate a new token on the website and
              enter it below.
            </Banner>
          </div>
        ) : null}
        <ServerCard
          initialUrl={null}
          configured={false}
          onSaved={() => check(true)}
        />
        <Card className="mt-4 p-4 text-sm text-dim">
          Don&apos;t have a token? Sign in to the website with your Google
          account and generate one under{" "}
          <span className="font-medium text-ink">/admin → Local sync</span>. If
          you can&apos;t sign in there, ask the administrator to add you.
        </Card>
      </>
    );
  }

  return (
    <>
      {status === "offline" ? (
        <div className="mb-4">
          <Banner tone="info">
            Couldn&apos;t reach the server to verify your access — working
            offline with your local files.
          </Banner>
        </div>
      ) : null}
      {email ? (
        <p className="mb-4 -mt-3 text-right text-xs text-muted">
          Connected as {email}
        </p>
      ) : null}
      {children}
    </>
  );
}
