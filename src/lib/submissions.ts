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

/** Normalised dedupe key for a submission: its email, lowercased. */
export function submissionKey(s: Pick<Submission, "bandmateEmail">): string {
  return s.bandmateEmail.trim().toLowerCase();
}

/**
 * Combine submissions embedded in a gig record (the legacy storage model)
 * with the current per-gig hash entries. Hash entries win on email conflicts;
 * the result is sorted oldest-first by submission time.
 */
export function combineSubmissions(
  legacy: Submission[] | undefined,
  current: Submission[],
): Submission[] {
  const seen = new Set(current.map(submissionKey));
  const kept = (legacy ?? []).filter((s) => !seen.has(submissionKey(s)));
  return [...kept, ...current].sort((a, b) =>
    a.submittedAt.localeCompare(b.submittedAt),
  );
}
