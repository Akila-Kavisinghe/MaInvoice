"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Banner, Card, Input, Label } from "@/components/ui";
import { displayMoney, formatDate } from "@/lib/format";
import { TAX_CATEGORIES, effectiveTaxCategoryId, taxCategoryById } from "@/lib/t2125";
import type { CategoryTag, LibraryEntry } from "../lib-types";
import { tagColorClasses } from "../tag-colors";

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
  const [tags, setTags] = useState<CategoryTag[]>([]);
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));
  const [open, setOpen] = useState<string | null>(null);
  const [hideAmounts, setHideAmounts] = useState(false);

  const load = useCallback(() => {
    fetch("/api/local/invoices")
      .then((r) => (r.ok ? r.json() : { invoices: [] }))
      .then((d) => setInvoices(d.invoices ?? []))
      .catch(() => {});
    fetch("/api/local/tags")
      .then((r) => (r.ok ? r.json() : { tags: [] }))
      .then((d) => setTags(d.tags ?? []))
      .catch(() => {});
    fetch("/api/local/settings")
      .then((r) => r.json())
      .then((d) => setHideAmounts(!!d.hideAmounts))
      .catch(() => {});
  }, []);

  useEffect(load, [load]);

  // Tag name → T2125 category; a tagged invoice reports under the mapping.
  const tagMap = useMemo(
    () => Object.fromEntries(tags.map((t) => [t.name, t.taxCategory])),
    [tags],
  );

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
    entries: expenses.filter((e) => effectiveTaxCategoryId(e, tagMap) === cat.id),
  })).filter((g) => g.entries.length > 0);
  const currentGroups = groups.filter((g) => !g.cat.capital);
  const capitalGroups = groups.filter((g) => g.cat.capital);
  const uncategorized = expenses.filter(
    (e) => !taxCategoryById(effectiveTaxCategoryId(e, tagMap)),
  );
  const totalCurrent = sum(currentGroups.flatMap((g) => g.entries));

  // "What goes where": expenses sliced by grouping tag. An invoice with two
  // tags appears under both — these are views, not accounting buckets.
  const eventTagGroups = useMemo(() => {
    const names = [...new Set(expenses.flatMap((e) => e.eventTags ?? []))].sort(
      (a, b) => a.localeCompare(b),
    );
    return names.map((name) => ({
      name,
      entries: expenses.filter((e) => (e.eventTags ?? []).includes(name)),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, year]);

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
              {typeof e.amount === "number"
                ? displayMoney(e.amount, hideAmounts)
                : "no amount"}
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

  const groupCard = (
    key: string,
    title: React.ReactNode,
    line: string | null,
    entries: LibraryEntry[],
  ) => (
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
          {displayMoney(sum(entries), hideAmounts)}
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
            {displayMoney(sum(uncategorized), hideAmounts)}) — assign categories on the{" "}
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
          Total {displayMoney(totalCurrent, hideAmounts)}
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

      {/* Grouping tags — what goes where */}
      {eventTagGroups.length > 0 ? (
        <div className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            By tag
          </h2>
          <p className="mt-1 text-xs text-dim">
            Expenses sliced by your grouping tags. An invoice carrying two tags
            shows under both, so these are views — not part of the totals above.
          </p>
          <div className="mt-2 space-y-2">
            {eventTagGroups.map((g) =>
              groupCard(
                `tag:${g.name}`,
                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 text-sm font-semibold ${tagColorClasses(g.name)}`}
                >
                  {g.name}
                </span>,
                null,
                g.entries,
              ),
            )}
          </div>
        </div>
      ) : null}

      <CategoryTagManager tags={tags} onChanged={load} />
    </>
  );
}

/**
 * Define your own expense vocabulary ("Van gas", "Strings") mapped to real
 * T2125 categories. Remapping a tag re-buckets every invoice carrying it —
 * invoices store the tag, not the category.
 */
function CategoryTagManager({
  tags,
  onChanged,
}: {
  tags: CategoryTag[];
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState(TAX_CATEGORIES[0].id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(tagName: string, taxCategory: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/local/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: tagName, taxCategory }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Couldn't save the tag");
        return false;
      }
      onChanged();
      return true;
    } catch {
      setError("Network error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
        My category tags
      </h2>
      <p className="mt-1 text-xs text-dim">
        Your own words for expenses, each mapped to a T2125 category. Apply
        them from the tax dropdown on the Invoices page; changing a mapping
        here instantly moves every tagged invoice to the new category.
      </p>
      <Card className="mt-2 p-4">
        {tags.length > 0 ? (
          <ul className="divide-y divide-slate-100">
            {tags.map((t) => (
              <li key={t.name} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate text-sm font-medium text-slate-800">
                  {t.name}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <select
                    value={t.taxCategory}
                    disabled={busy}
                    onChange={(e) => save(t.name, e.target.value)}
                    className="rounded-lg border border-hair bg-elev px-2 py-1 text-xs text-ink outline-none focus:border-accent"
                  >
                    {TAX_CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      if (
                        !window.confirm(
                          `Delete the tag "${t.name}"?\n\nInvoices keep the tag name but fall back to their own category (or uncategorized) on this summary.`,
                        )
                      ) {
                        return;
                      }
                      setBusy(true);
                      try {
                        await fetch(
                          `/api/local/tags?name=${encodeURIComponent(t.name)}`,
                          { method: "DELETE" },
                        );
                        onChanged();
                      } finally {
                        setBusy(false);
                      }
                    }}
                    className="rounded px-1.5 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-dim">
            No tags yet — create one below, e.g. &quot;Van gas&quot; → Motor
            Vehicle Expenses.
          </p>
        )}

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return;
            if (await save(name.trim(), category)) {
              setName("");
              setCategory(TAX_CATEGORIES[0].id);
            }
          }}
          className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3"
        >
          <div className="min-w-40 flex-1">
            <Label>Tag name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Van gas"
            />
          </div>
          <div className="min-w-48 flex-1">
            <Label>T2125 category</Label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-[10px] border border-hair bg-elev px-3.5 py-3 text-ink outline-none transition focus:border-accent"
            >
              {TAX_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="rounded-[10px] bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            Add tag
          </button>
        </form>
        {error ? (
          <div className="mt-2">
            <Banner tone="error">{error}</Banner>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
