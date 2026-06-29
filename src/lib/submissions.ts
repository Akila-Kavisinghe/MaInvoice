import type { Submission } from "./types";

/**
 * Upsert a submission into a gig's list, keyed by email (case-insensitive).
 *
 * If the same bandmate (matched on email) already submitted for this gig, their
 * previous entry is removed and the new one is appended — so regenerating or
 * sending twice keeps only the latest submission per person.
 */
export function mergeSubmission(
  existing: Submission[] | undefined,
  incoming: Submission,
): Submission[] {
  const key = incoming.bandmateEmail.trim().toLowerCase();
  const withoutDupes = (existing ?? []).filter(
    (s) => s.bandmateEmail.trim().toLowerCase() !== key,
  );
  return [...withoutDupes, incoming];
}
