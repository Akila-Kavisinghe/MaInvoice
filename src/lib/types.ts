/** Shared invoice details the admin enters once per gig. */
export interface Gig {
  /** Opaque, unguessable token used in the share link. */
  token: string;
  /** ISO timestamp the link was created. */
  createdAt: string;
  /**
   * Lowercased email of the signed-in user who created the link. Absent on
   * legacy gigs created before multi-user support — those are adopted by the
   * super admin on their next visit (see migrateLegacyGigs).
   */
  ownerEmail?: string;

  // ---- Payee (the admin / band — who is billed) ----
  payeeName: string; // business name
  payeeContact?: string; // contact person
  payeeEmail: string;
  payeeAddress?: string;
  payeePhone?: string;

  // ---- Event ----
  eventName: string;
  eventDate: string; // ISO date (yyyy-mm-dd)
  venue?: string;

  // ---- Payment ----
  paymentDescription: string;
  /** If set, the bandmate cannot change the amount. */
  amountLocked: boolean;
  defaultAmount?: number;
  dueDate?: string; // ISO date
  notes?: string;

  /**
   * Minimal record of who has generated an invoice for this gig. Only the
   * fields needed for admin tracking are kept — addresses, tax numbers,
   * payment methods and free-text notes are NOT stored (they live only in the
   * generated PDF).
   */
  submissions?: Submission[];
}

export interface Submission {
  bandmateName: string;
  bandmateEmail: string;
  invoiceNumber: string;
  amount: number;
  submittedAt: string; // ISO timestamp
}

/** Subset of a Gig that is safe to send to an authenticated bandmate. */
export type GigPublic = Omit<Gig, never>;

/** Details the bandmate fills in. Never persisted to disk. */
export interface BandmateInput {
  bandmateName: string;
  bandmateEmail: string;
  bandmateAddress?: string;
  invoiceNumber: string;
  amount: number;
  taxNumber?: string;
  paymentMethod?: string;
  notes?: string;
}

/** A user allowed to sign in with Google and run their own invoice links. */
export interface AllowedUser {
  email: string; // lowercased
  addedAt: string; // ISO timestamp
  addedBy: string; // super admin's email
}

/**
 * A generated invoice PDF retained server-side until the owner's local app
 * pulls it into their invoice folder (then it is deleted). Expires after 30
 * days if never synced — the PDF contains bandmate details we don't want to
 * hold indefinitely.
 */
export interface PendingInvoice {
  id: string; // crypto.randomUUID()
  ownerEmail: string;
  gigToken: string;
  eventName: string;
  eventDate: string; // yyyy-mm-dd
  bandmateName: string;
  /** Optional: pendings stored before this field existed lack it. */
  bandmateEmail?: string;
  invoiceNumber: string;
  amount: number;
  filename: string;
  createdAt: string; // ISO timestamp
  pdfBase64: string;
}

/** Pending invoice without the payload — safe to list. */
export type PendingInvoiceMeta = Omit<PendingInvoice, "pdfBase64">;
