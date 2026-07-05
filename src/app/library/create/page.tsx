import { resolveInvoiceDir } from "@/lib/local-settings";
import CreateFlow from "./CreateFlow";

export const dynamic = "force-dynamic";

/** Guided invoice creation (local-mode gate lives in the layout). */
export default function CreatePage() {
  return <CreateFlow hasFolder={resolveInvoiceDir() !== null} />;
}
