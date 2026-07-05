/**
 * Canadian sole-proprietorship bookkeeping knowledge (form T2125,
 * "Statement of Business or Professional Activities").
 *
 * Every expense-side entry in the library (inbound invoices, uploaded
 * purchases) eventually belongs to one T2125 reporting category, so at tax
 * time a calendar year can be summed straight into the form's expense lines.
 * Categories are assigned MANUALLY via the dropdown on each invoice row.
 *
 * Capital assets are deliberately separated: equipment with lasting value
 * (instruments, computers, PA systems…) is generally NOT fully expensed in
 * the purchase year — it's depreciated via Capital Cost Allowance (CCA).
 * This app only flags "this may be a capital asset"; it does not compute CCA.
 */

export interface TaxCategory {
  id: string;
  label: string;
  /** T2125 line number(s), shown for cross-referencing with the form. */
  line: string;
  /** Capital assets are reported via CCA (Area A), not as a current expense. */
  capital?: boolean;
}

export const TAX_CATEGORIES: TaxCategory[] = [
  { id: "advertising", label: "Advertising", line: "8521" },
  // Meals & entertainment are generally only 50% deductible — the summary
  // surfaces the gross total; the 50% rule is applied on the form itself.
  { id: "meals-entertainment", label: "Meals & Entertainment", line: "8523" },
  { id: "insurance", label: "Insurance", line: "8690" },
  { id: "interest-bank", label: "Interest & Bank Charges", line: "8710" },
  { id: "business-taxes-licences", label: "Business Taxes / Licences / Memberships", line: "8760" },
  { id: "office", label: "Office Expenses", line: "8810" },
  { id: "supplies", label: "Supplies", line: "8811" },
  { id: "professional-fees", label: "Professional Fees", line: "8860" },
  { id: "management-fees", label: "Management Fees", line: "8871" },
  { id: "rent", label: "Rent", line: "8910" },
  { id: "repairs-maintenance", label: "Repairs & Maintenance", line: "8960" },
  { id: "contract-labour", label: "Salaries / Contract Labour", line: "9060 / 8360" },
  { id: "travel", label: "Travel", line: "9200" },
  { id: "utilities-phone-internet", label: "Utilities / Phone / Internet", line: "9220" },
  { id: "delivery-freight", label: "Delivery / Freight", line: "9275" },
  { id: "motor-vehicle", label: "Motor Vehicle Expenses", line: "9281" },
  { id: "other", label: "Other Expenses", line: "9270" },
  { id: "capital-assets", label: "Capital Assets (CCA)", line: "9936", capital: true },
];

export const TAX_CATEGORY_IDS = TAX_CATEGORIES.map((c) => c.id);

export function taxCategoryById(id: string | undefined): TaxCategory | undefined {
  return TAX_CATEGORIES.find((c) => c.id === id);
}
