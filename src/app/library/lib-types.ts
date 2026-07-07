/** Client-side mirrors of the library/contact shapes (see src/lib/library.ts). */

export interface LibraryEntry {
  id: string;
  relPath: string;
  source: "sync" | "upload" | "generated";
  direction: "inbound" | "outbound";
  eventName?: string;
  description?: string;
  eventDate?: string;
  bandmateName?: string;
  invoiceNumber?: string;
  amount?: number;
  notes?: string;
  contactEmail?: string;
  contactName?: string;
  emailReceived?: boolean;
  receiptPaths?: string[];
  paidAt?: string;
  paidReason?: string;
  taxCategory?: string;
  /** Custom category tag name — its T2125 mapping wins over taxCategory. */
  categoryTag?: string;
  /** Free-form grouping tags. */
  eventTags?: string[];
  /** Set while a copy of this synced invoice still exists on the website. */
  pendingId?: string;
  addedAt: string;
}

export interface CategoryTag {
  name: string;
  taxCategory: string;
  createdAt: string;
}

export interface Contact {
  email: string;
  name: string;
  address?: string;
  phone?: string;
  notes?: string;
  createdAt: string;
}

export interface BusinessInfo {
  name: string;
  email: string;
  address: string;
  phone: string;
  taxNumber: string;
}

export interface RemoteInfo {
  url: string | null;
  configured: boolean;
}
