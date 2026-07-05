"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/ui";

/** Shared header for the local library: Invoices / Create + settings gear. */
export default function Nav() {
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
      <Link href="/library">
        <Logo />
      </Link>
      <nav className="flex items-center gap-1">
        {tab("/library", "Invoices", true)}
        {tab("/library/links", "Links")}
        {tab("/library/create", "Create")}
        {tab("/library/taxes", "Taxes")}
        <Link
          href="/library/settings"
          aria-label="Settings"
          title="Settings"
          className={`ml-1 rounded-lg p-2 ${
            pathname.startsWith("/library/settings")
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
