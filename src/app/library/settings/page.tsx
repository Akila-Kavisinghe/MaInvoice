import { resolveInvoiceDir } from "@/lib/local-settings";
import SettingsView from "./SettingsView";

export const dynamic = "force-dynamic";

/** Settings page (local-mode gate lives in the layout). */
export default function SettingsPage() {
  return <SettingsView initialDir={resolveInvoiceDir()} />;
}
