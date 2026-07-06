/**
 * Deterministic badge colour for a grouping tag: hash the name into a fixed
 * palette so "Summer Tour 2026" is the same colour on every row, the filter,
 * and the tax summary. Class strings are static so Tailwind keeps them.
 */
const PALETTE = [
  "bg-sky-500/15 text-sky-400",
  "bg-violet-500/15 text-violet-400",
  "bg-amber-500/15 text-amber-400",
  "bg-emerald-500/15 text-emerald-400",
  "bg-rose-500/15 text-rose-400",
  "bg-cyan-500/15 text-cyan-400",
  "bg-lime-500/15 text-lime-400",
  "bg-fuchsia-500/15 text-fuchsia-400",
];

export function tagColorClasses(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
