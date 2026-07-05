import { z } from "zod";

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
  eventDate: isoDate.optional().or(z.literal("").transform(() => undefined)),
  bandmateName: optionalText,
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
