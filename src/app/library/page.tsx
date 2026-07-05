import { resolveInvoiceDir } from "@/lib/local-settings";
import LibraryApp from "./LibraryApp";

export const dynamic = "force-dynamic";

/** Invoices page (local-mode gate lives in the layout). */
export default function LibraryPage() {
  // May be null on first run — the app then opens with the folder picker.
  return <LibraryApp initialDir={resolveInvoiceDir()} />;
}
