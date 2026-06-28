/** Shared invoice details the admin enters once per gig. */
export interface Gig {
  /** Opaque, unguessable token used in the share link. */
  token: string;
  /** ISO timestamp the link was created. */
  createdAt: string;

  // ---- Payee (the admin / band) ----
  payeeName: string;
  payeeEmail: string;
  payeeAddress?: string;

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
