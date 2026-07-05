"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Banner, Card } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";
import { TAX_CATEGORIES, taxCategoryById } from "@/lib/t2125";
import type { LibraryEntry } from "../lib-types";

/** Calendar year an entry belongs to: the event date, else when it was filed. */
function entryYear(e: LibraryEntry): string {
  return (e.eventDate ?? e.addedAt).slice(0, 4);
}

/**
 * T2125 year-end summary: income (your outbound invoices) and expenses
 * grouped by reporting category, with capital assets separated because they
 * are generally depreciated (CCA) rather than fully expensed. Each group
 * expands to the underlying invoices.
 */
export default function TaxesView() {
  const [invoices, setInvoices] = useState<LibraryEntry[]>([]);
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/local/invoices")
      .then((r) => (r.ok ? r.json() : { invoices: [] }))
      .then((d) => setInvoices(d.invoices ?? []))
      .catch(() => {});
  }, []);

  useEffect(load, [load]);

  const years = useMemo(() => {
    const ys = new Set(invoices.map(entryYear));
    ys.add(String(new Date().getFullYear()));
    return [...ys].sort((a, b) => b.localeCompare(a));
  }, [invoices]);

  const inYear = invoices.filter((e) => entryYear(e) === year);
  const income = inYear.filter((e) => e.direction === "outbound");
  const expenses = inYear.filter((e) => e.direction !== "outbound");

  const sum = (list: LibraryEntry[]) =>
    list.reduce((t, e) => t + (typeof e.amount === "number" ? e.amount : 0), 0);

  const missingAmounts = inYear.filter((e) => typeof e.amount !== "number").length;

  const groups = TAX_CATEGORIES.map((cat) => ({
    cat,
    entries: expenses.filter((e) => e.taxCategory === cat.id),
  })).filter((g) => g.entries.length > 0);
  const currentGroups = groups.filter((g) => !g.cat.capital);
  const capitalGroups = groups.filter((g) => g.cat.capital);
  const uncategorized = expenses.filter(
    (e) => !e.taxCategory || !taxCategoryById(e.taxCategory),
  );
  const totalCurrent = sum(currentGroups.flatMap((g) => g.entries));

  const entryList = (list: LibraryEntry[]) => (
    <ul className="mt-2 divide-y divide-slate-100 border-t border-slate-100">
      {list.map((e) => (
        <li key={e.id} className="flex items-center justify-between gap-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-800">
              {e.eventName || e.relPath.split("/").pop()}
            </p>
            <p className="text-xs text-slate-400">
              {[
                e.contactName ?? e.bandmateName,
                e.invoiceNumber,
                e.eventDate ? formatDate(e.eventDate) : formatDate(e.addedAt.slice(0, 10)),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-sm font-semibold text-slate-800">
              {typeof e.amount === "number" ? formatMoney(e.amount) : "no amount"}
            </span>
            <a
              href={`/api/local/invoices/${e.id}`}
              target="_blank"
              rel="noreferrer"
              className="rounded px-1.5 py-0.5 text-xs font-medium text-accent hover:bg-elev"
            >
              View
            </a>
          </div>
        </li>
      ))}
    </ul>
  );

  const groupCard = (key: string, title: string, line: string | null, entries: LibraryEntry[]) => (
    <Card key={key} className="p-4">
      <button
        type="button"
        onClick={() => setOpen(open === key ? null : key)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-800">{title}</p>
          <p className="text-xs text-slate-400">
            {line ? `T2125 line ${line} · ` : ""}
            {entries.length} entr{entries.length === 1 ? "y" : "ies"}
          </p>
        </div>
        <span className="shrink-0 text-base font-semibold text-slate-800">
          {formatMoney(sum(entries))}
          <span className="ml-2 text-xs font-normal text-slate-400">
            {open === key ? "▲" : "▼"}
          </span>
        </span>
      </button>
      {open === key ? entryList(entries) : null}
    </Card>
  );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-ink">Tax year summary</h1>
        <select
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className="rounded-lg border border-hair bg-elev px-3 py-1.5 text-sm font-semibold text-ink outline-none focus:border-accent"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
      <p className="mt-1 text-sm text-dim">
        Totals grouped by T2125 category for your sole-proprietorship return.
        Assign each invoice&apos;s category with the dropdown on the Invoices
        page.
      </p>

      {missingAmounts > 0 ? (
        <div className="mt-4">
          <Banner tone="info">
            {missingAmounts} entr{missingAmounts === 1 ? "y has" : "ies have"} no
            amount recorded and count as $0 here.
          </Banner>
        </div>
      ) : null}

      {/* Income */}
      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-slate-400">
        Income (your outbound invoices)
      </h2>
      <div className="mt-2">
        {income.length === 0 ? (
          <Card className="p-4 text-sm text-dim">No outbound invoices in {year}.</Card>
        ) : (
          groupCard("income", "Gross business income", null, income)
        )}
      </div>

      {/* Uncategorized — the to-do pile */}
      {uncategorized.length > 0 ? (
        <div className="mt-6">
          <Banner tone="error">
            {uncategorized.length} expense entr{uncategorized.length === 1 ? "y" : "ies"} in{" "}
            {year} {uncategorized.length === 1 ? "is" : "are"} uncategorized (
            {formatMoney(sum(uncategorized))}) — assign categories on the{" "}
            <Link href="/library" className="font-medium underline">
              Invoices page
            </Link>{" "}
            so they land on the right T2125 line.
          </Banner>
          <div className="mt-2">
            {groupCard("uncategorized", "Uncategorized", null, uncategorized)}
          </div>
        </div>
      ) : null}

      {/* Expenses by category */}
      <div className="mt-6 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Expenses
        </h2>
        <span className="text-sm font-semibold text-slate-800">
          Total {formatMoney(totalCurrent)}
        </span>
      </div>
      <div className="mt-2 space-y-2">
        {currentGroups.length === 0 ? (
          <Card className="p-4 text-sm text-dim">No categorized expenses in {year}.</Card>
        ) : (
          currentGroups
            .sort((a, b) => sum(b.entries) - sum(a.entries))
            .map((g) => groupCard(g.cat.id, g.cat.label, g.cat.line, g.entries))
        )}
      </div>

      {/* Capital assets — separated on purpose */}
      {capitalGroups.length > 0 ? (
        <div className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Capital assets (CCA)
          </h2>
          <p className="mt-1 text-xs text-dim">
            Equipment with lasting value is generally depreciated via Capital
            Cost Allowance rather than fully expensed in the purchase year —
            these are kept out of the expense total above. Confirm treatment
            with your accountant.
          </p>
          <div className="mt-2 space-y-2">
            {capitalGroups.map((g) => groupCard(g.cat.id, g.cat.label, g.cat.line, g.entries))}
          </div>
        </div>
      ) : null}
    </>
  );
}
