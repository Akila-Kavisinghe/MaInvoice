import { z } from "zod";
import { TAX_CATEGORY_IDS } from "./t2125";

const trimmed = z.string().trim();
const optionalText = trimmed.max(2000).optional().or(z.literal("").transform(() => undefined));
const isoDate = trimmed.regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");

/** Admin → create a gig link. */
export const gigCreateSchema = z
  .object({
    payeeName: trimmed.min(1, "Required").max(200),
    payeeContact: optionalText,
    payeeEmail: trimmed.email("Enter a valid email").max(200),
    payeeAddress: optionalText,
    payeePhone: optionalText,

    eventName: trimmed.min(1, "Required").max(200),
    eventDate: isoDate,
    venue: optionalText,

    paymentDescription: trimmed.min(1, "Required").max(500),
    amountLocked: z.boolean().default(false),
    defaultAmount: z
      .number({ invalid_type_error: "Enter a number" })
      .nonnegative()
      .max(1_000_000)
      .optional(),
    dueDate: isoDate.optional().or(z.literal("").transform(() => undefined)),
    notes: optionalText,
  })
  .refine((d) => !d.amountLocked || typeof d.defaultAmount === "number", {
    message: "Set a default amount if the amount is locked",
    path: ["defaultAmount"],
  });

export type GigCreateInput = z.infer<typeof gigCreateSchema>;

/** Bandmate → fill in their invoice details. */
export const bandmateSchema = z.object({
  bandmateName: trimmed.min(1, "Required").max(200),
  bandmateEmail: trimmed.email("Enter a valid email").max(200),
  bandmateAddress: optionalText,
  // invoiceNumber is generated server-side, not supplied by the bandmate.
  amount: z
    .number({ invalid_type_error: "Enter a number" })
    .positive("Enter an amount greater than 0")
    .max(1_000_000),
  taxNumber: optionalText,
  paymentMethod: optionalText,
  notes: optionalText,
});

export type BandmateFormInput = z.infer<typeof bandmateSchema>;

export const passwordSchema = z.object({
  password: z.string().min(1, "Enter the password").max(200),
});

/** Super admin → add a user to the allowlist. */
export const allowedEmailSchema = z.object({
  email: trimmed
    .email("Enter a valid email")
    .max(200)
    .transform((e) => e.toLowerCase()),
});

/** Local app → confirm pending invoices were written to disk. */
export const syncAckSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
});

/** Local library → metadata for a manually uploaded or adopted invoice. */
export const libraryMetaSchema = z.object({
  eventName: optionalText,
  description: trimmed.max(200).optional().or(z.literal("").transform(() => undefined)),
  eventDate: isoDate.optional().or(z.literal("").transform(() => undefined)),
  bandmateName: optionalText,
  contactEmail: trimmed
    .email("Enter a valid email")
    .max(200)
    .transform((e) => e.toLowerCase())
    .optional()
    .or(z.literal("").transform(() => undefined)),
  invoiceNumber: optionalText,
  // Arrives as a form-data string; "" means "not provided" (plain coerce
  // would turn "" into 0).
  amount: z.preprocess(
    (v) => (v === "" || v == null ? undefined : Number(v)),
    z.number({ invalid_type_error: "Enter a number" }).nonnegative().max(1_000_000).optional(),
  ),
  notes: optionalText,
});

/** Local library → adopt a file already in the folder into the manifest. */
export const indexFileSchema = libraryMetaSchema.extend({
  relPath: trimmed.min(1).max(1000),
});

const optionalEmail = trimmed
  .email("Enter a valid email")
  .max(200)
  .transform((e) => e.toLowerCase())
  .optional()
  .or(z.literal("").transform(() => undefined));

/** Local library → create/edit a contact card. */
export const contactSchema = z.object({
  email: trimmed.email("Enter a valid email").max(200).transform((e) => e.toLowerCase()),
  name: optionalText,
  address: optionalText,
  phone: optionalText,
  notes: optionalText,
});

/** Local library → generate an outbound invoice (money the user requests). */
export const outboundSchema = z.object({
  clientName: trimmed.min(1, "Required").max(200),
  clientEmail: optionalEmail,
  clientAddress: optionalText,
  eventName: optionalText,
  eventDate: isoDate.optional().or(z.literal("").transform(() => undefined)),
  venue: optionalText,
  description: trimmed.min(1, "Required").max(500),
  amount: z
    .number({ invalid_type_error: "Enter a number" })
    .positive("Enter an amount greater than 0")
    .max(1_000_000),
  dueDate: isoDate.optional().or(z.literal("").transform(() => undefined)),
  paymentInstructions: optionalText,
  notes: optionalText,
  /** Store/refresh the client's contact card for future autofill. */
  saveContact: z.boolean().default(true),
});

export type OutboundInput = z.infer<typeof outboundSchema>;

/**
 * Local library → toggle flags, set the T2125 category, or edit the details
 * on an invoice row. Detail fields distinguish absent (untouched) from empty
 * string (cleared), so they deliberately don't reuse optionalText.
 */
export const invoicePatchSchema = z
  .object({
    emailReceived: z.boolean().optional(),
    paid: z.boolean().optional(),
    paidReason: trimmed.max(200).optional(),
    taxCategory: z
      .string()
      .refine((v) => TAX_CATEGORY_IDS.includes(v), "Unknown category")
      .nullable()
      .optional(),
    /** Custom category tag name; existence isn't checked — a dangling tag
     * simply falls back to taxCategory on the summary. */
    categoryTag: trimmed.max(60).nullable().optional(),
    /** Blank entries are tolerated here and dropped by the library layer. */
    eventTags: z.array(trimmed.max(40)).max(20).optional(),
    eventName: trimmed.max(200).optional(),
    description: trimmed.max(200).optional(),
    eventDate: isoDate.or(z.literal("")).optional(),
    contactName: trimmed.max(200).optional(),
    contactEmail: trimmed
      .email("Enter a valid email")
      .toLowerCase()
      .or(z.literal(""))
      .optional(),
    invoiceNumber: trimmed.max(60).optional(),
    amount: z
      .number({ invalid_type_error: "Enter a number" })
      .positive("Enter an amount greater than 0")
      .max(1_000_000)
      .nullable()
      .optional(),
    notes: trimmed.max(2000).optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: "Nothing to update",
  });

export type InvoicePatch = z.infer<typeof invoicePatchSchema>;

/** Local library → create or remap a custom category tag. */
export const categoryTagSchema = z.object({
  name: trimmed.min(1, "Required").max(60),
  taxCategory: z
    .string()
    .refine((v) => TAX_CATEGORY_IDS.includes(v), "Unknown category"),
});
