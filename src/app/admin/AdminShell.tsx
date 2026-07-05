"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Banner, Button, Card, Logo } from "@/components/ui";
import type { BusinessDefaults, LinkRow, UserInfo } from "./components";

interface AdminData {
  user: UserInfo;
  defaults: BusinessDefaults | null;
  gigs: LinkRow[];
}

const AdminContext = createContext<{ data: AdminData; reload: () => void } | null>(
  null,
);

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin outside AdminShell");
  return ctx;
}

type View = "loading" | "login" | "app";

/**
 * Wraps every /admin page: probes auth (Google session), shows the sign-in
 * screen when logged out, and provides links/user data via context so pages
 * don't refetch on every navigation.
 */
export default function AdminShell({ children }: { children: React.ReactNode }) {
  const [view, setView] = useState<View>("loading");
  const [authError, setAuthError] = useState<string | null>(null);
  const [data, setData] = useState<AdminData | null>(null);

  const reload = useCallback(() => {
    fetch("/api/admin/links")
      .then(async (r) => {
        if (!r.ok) {
          setView("login");
          return;
        }
        const d = await r.json();
        setData({ user: d.user, defaults: d.defaults ?? null, gigs: d.gigs ?? [] });
        setView("app");
      })
      .catch(() => setView("login"));
  }, []);

  useEffect(() => {
    // Surface errors handed back by the OAuth callback redirect.
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    if (error === "not-authorized") {
      const email = params.get("email");
      setAuthError(
        `${email ?? "This account"} isn't authorized to use this app. Ask the administrator to add you.`,
      );
    } else if (error) {
      setAuthError("Sign-in failed. Please try again.");
    }
    if (error) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    reload();
  }, [reload]);

  if (view === "loading") {
    return (
      <main className="mx-auto flex min-h-screen max-w-md items-center justify-center px-4 text-slate-400">
        Loading…
      </main>
    );
  }

  if (view === "login" || !data) {
    return <SignIn error={authError} />;
  }

  return (
    <AdminContext.Provider value={{ data, reload }}>
      <main className="mx-auto max-w-lg px-4 py-8">
        <AdminNav />
        {children}
      </main>
    </AdminContext.Provider>
  );
}

function AdminNav() {
  const pathname = usePathname();
  const tab = (href: string, label: string, exact = false) => {
    const active = exact ? pathname === href : pathname.startsWith(href);
    return (
      <Link
        href={href}
        className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
          active ? "bg-accent/10 text-accent" : "text-dim hover:bg-elev hover:text-ink"
        }`}
      >
        {label}
      </Link>
    );
  };
  return (
    <div className="mb-6 flex items-center justify-between gap-3">
      <Link href="/admin">
        <Logo />
      </Link>
      <nav className="flex items-center gap-1">
        {tab("/admin", "Links", true)}
        {tab("/admin/create", "Create")}
        <Link
          href="/admin/settings"
          aria-label="Settings"
          title="Settings"
          className={`ml-1 rounded-lg p-2 ${
            pathname.startsWith("/admin/settings")
              ? "bg-accent/10 text-accent"
              : "text-dim hover:bg-elev hover:text-ink"
          }`}
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
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </Link>
      </nav>
    </div>
  );
}

function SignIn({ error }: { error: string | null }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <Logo className="mb-6" />
      <Card className="p-7">
        <h1 className="text-xl font-semibold text-ink">Sign in</h1>
        <p className="mt-1 text-sm text-dim">
          Sign in with your Google account to create invoice links and manage
          your bookkeeping.
        </p>
        {error ? (
          <div className="mt-4">
            <Banner tone="error">{error}</Banner>
          </div>
        ) : null}
        <a href="/api/auth/google" className="mt-5 block">
          <Button type="button" variant="secondary">
            <GoogleIcon />
            Sign in with Google
          </Button>
        </a>
      </Card>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
