/** Client-side mirrors of the library/contact shapes (see src/lib/library.ts). */

export interface LibraryEntry {
  id: string;
  relPath: string;
  source: "sync" | "upload" | "generated";
  direction: "inbound" | "outbound";
  eventName?: string;
  eventDate?: string;
  bandmateName?: string;
  invoiceNumber?: string;
  amount?: number;
  notes?: string;
  contactEmail?: string;
  contactName?: string;
  emailReceived?: boolean;
  receiptPath?: string;
  paidAt?: string;
  taxCategory?: string;
  addedAt: string;
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
