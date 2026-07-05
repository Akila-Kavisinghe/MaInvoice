import TaxesView from "./TaxesView";

export const dynamic = "force-dynamic";

/** T2125 tax-year summary (local-mode gate lives in the layout). */
export default function TaxesPage() {
  return <TaxesView />;
}
