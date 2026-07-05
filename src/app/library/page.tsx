import { notFound } from "next/navigation";
import { config } from "@/lib/config";
import { resolveInvoiceDir } from "@/lib/local-settings";
import LibraryApp from "./LibraryApp";

export const dynamic = "force-dynamic";

/**
 * The local invoice library. Only exists when the app runs on the user's own
 * machine in local mode (LOCAL_MODE=1) — on the deployed server this page and
 * every /api/local/* route 404.
 */
export default function LibraryPage() {
  if (!config.localMode || process.env.VERCEL) notFound();
  // May be null on first run — the app then opens with the folder picker.
  return <LibraryApp initialDir={resolveInvoiceDir()} />;
}
