import { Redis } from "@upstash/redis";
import type {
  AllowedUser,
  Gig,
  PendingInvoice,
  PendingInvoiceMeta,
  Submission,
} from "./types";
import { combineSubmissions, submissionKey } from "./submissions";

/**
 * Upstash Redis store — serverless-friendly, used in production (Vercel).
 *
 * Data model:
 *   gig:<token>            -> Gig object (JSON). Older records may still embed a
 *                             `submissions` array (the pre-hash model); those are
 *                             merged in on read.
 *   gig:<token>:subs       -> hash of email-key -> Submission (JSON). One HSET per
 *                             submission, so concurrent bandmates can never clobber
 *                             each other — a read-modify-write on the gig object
 *                             could lose one of two simultaneous submissions.
 *   user:<email>:gigs      -> sorted set of the user's gig tokens, scored by
 *                             creation time. gig:<token> stays globally keyed so
 *                             the anonymous bandmate flow can resolve a token
 *                             without knowing the owner; ownership is enforced
 *                             in the admin routes.
 *   gigs:index             -> LEGACY sorted set from the single-tenant era;
 *                             drained by migrateLegacyGigs, then unused.
 *   users:allowlist        -> hash of email -> AllowedUser (JSON).
 *   synctoken:<sha256>     -> owner email (bearer-token lookup).
 *   user:<email>:synctoken -> sha256 of the user's current sync token (for revoke).
 *   pending:<id>           -> PendingInvoice (JSON incl. base64 PDF), 90-day TTL.
 *   user:<email>:pending   -> sorted set of pending ids, scored by creation time.
 */

const GIG_KEY = (token: string) => `gig:${token}`;
const SUBS_KEY = (token: string) => `gig:${token}:subs`;
const LEGACY_INDEX_KEY = "gigs:index";
const USER_GIGS_KEY = (email: string) => `user:${email}:gigs`;
const ALLOWLIST_KEY = "users:allowlist";
const SYNC_TOKEN_KEY = (hash: string) => `synctoken:${hash}`;
const USER_SYNC_TOKEN_KEY = (email: string) => `user:${email}:synctoken`;
const PENDING_KEY = (id: string) => `pending:${id}`;
const USER_PENDING_KEY = (email: string) => `user:${email}:pending`;

// Generous window: copies are only deleted when the user confirms removal
// after a successful sync, so the TTL is a backstop, not the cleanup path.
export const PENDING_TTL_SECONDS = 90 * 24 * 60 * 60;

/**
 * Accept both naming conventions:
 *  - UPSTASH_REDIS_REST_URL / _TOKEN  (Upstash native / manual setup)
 *  - KV_REST_API_URL / _TOKEN         (Vercel Marketplace integration)
 */
export function redisEnv(): { url: string; token: string } | null {
  const url =
    process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
  return url && token ? { url, token } : null;
}

let client: Redis | null = null;
function redis(): Redis {
  // Lazily created so importing this module never throws when env is absent.
  if (!client) {
    const env = redisEnv();
    if (!env) throw new Error("Upstash Redis env vars are not set.");
    client = new Redis(env);
  }
  return client;
}

function withSubmissions(gig: Gig, hash: Record<string, Submission> | null): Gig {
  return {
    ...gig,
    submissions: combineSubmissions(gig.submissions, Object.values(hash ?? {})),
  };
}

// ---------------------------------------------------------------------------
// Gigs
// ---------------------------------------------------------------------------

export async function getGig(token: string): Promise<Gig | null> {
  const [gig, subs] = await Promise.all([
    redis().get<Gig>(GIG_KEY(token)),
    redis().hgetall<Record<string, Submission>>(SUBS_KEY(token)),
  ]);
  return gig ? withSubmissions(gig, subs) : null;
}

export async function saveGig(gig: Gig): Promise<void> {
  const writes: Promise<unknown>[] = [redis().set(GIG_KEY(gig.token), gig)];
  const score = Date.parse(gig.createdAt);
  if (gig.ownerEmail) {
    writes.push(
      redis().zadd(USER_GIGS_KEY(gig.ownerEmail), { score, member: gig.token }),
    );
  } else {
    // Should not happen for new gigs; keeps any owner-less write discoverable.
    writes.push(redis().zadd(LEGACY_INDEX_KEY, { score, member: gig.token }));
  }
  await Promise.all(writes);
}

export async function listGigs(ownerEmail: string): Promise<Gig[]> {
  // Newest first.
  const tokens = await redis().zrange<string[]>(USER_GIGS_KEY(ownerEmail), 0, -1, {
    rev: true,
  });
  if (!tokens.length) return [];

  const pipeline = redis().pipeline();
  for (const token of tokens) pipeline.get(GIG_KEY(token));
  for (const token of tokens) pipeline.hgetall(SUBS_KEY(token));
  const results = await pipeline.exec<(Gig | Record<string, Submission> | null)[]>();

  const gigs: Gig[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const gig = results[i] as Gig | null;
    if (!gig) continue;
    const subs = results[tokens.length + i] as Record<string, Submission> | null;
    gigs.push(withSubmissions(gig, subs));
  }
  return gigs;
}

export async function addSubmission(
  token: string,
  submission: Submission,
): Promise<void> {
  // Don't create orphan submission hashes for deleted/unknown gigs.
  if (!(await redis().exists(GIG_KEY(token)))) return;
  await redis().hset(SUBS_KEY(token), { [submissionKey(submission)]: submission });
}

/** Delete one bandmate's submission record from a gig (keyed by email). */
export async function removeSubmission(token: string, email: string): Promise<void> {
  const key = email.trim().toLowerCase();
  const gig = await redis().get<Gig>(GIG_KEY(token));
  await redis().hdel(SUBS_KEY(token), key);
  // Legacy records may also embed submissions in the gig object — clean those
  // too, or combineSubmissions would resurrect the entry on the next read.
  if (gig?.submissions?.some((s) => submissionKey(s) === key)) {
    await redis().set(GIG_KEY(token), {
      ...gig,
      submissions: gig.submissions.filter((s) => submissionKey(s) !== key),
    });
  }
}

/** Archive (revoke) or restore a link. Archived gigs keep their submissions. */
export async function setGigArchived(token: string, archived: boolean): Promise<void> {
  const gig = await redis().get<Gig>(GIG_KEY(token));
  if (!gig) return;
  const next = { ...gig };
  if (archived) next.archivedAt = new Date().toISOString();
  else delete next.archivedAt;
  await redis().set(GIG_KEY(token), next);
}

export async function deleteGig(token: string): Promise<void> {
  const gig = await redis().get<Gig>(GIG_KEY(token));
  const deletes: Promise<unknown>[] = [
    redis().del(GIG_KEY(token)),
    redis().del(SUBS_KEY(token)),
    redis().zrem(LEGACY_INDEX_KEY, token),
  ];
  if (gig?.ownerEmail) {
    deletes.push(redis().zrem(USER_GIGS_KEY(gig.ownerEmail), token));
  }
  await Promise.all(deletes);
}

/**
 * Adopt pre-multi-user gigs: stamp them with the super admin's email and move
 * them from the legacy global index to their per-user index. Idempotent; cheap
 * (one ZRANGE) once the legacy index is empty.
 */
export async function migrateLegacyGigs(superAdminEmail: string): Promise<number> {
  const tokens = await redis().zrange<string[]>(LEGACY_INDEX_KEY, 0, -1);
  let migrated = 0;
  for (const token of tokens) {
    const gig = await redis().get<Gig>(GIG_KEY(token));
    if (gig) {
      const owner = gig.ownerEmail ?? superAdminEmail;
      if (!gig.ownerEmail) {
        await redis().set(GIG_KEY(token), { ...gig, ownerEmail: owner });
      }
      await redis().zadd(USER_GIGS_KEY(owner), {
        score: Date.parse(gig.createdAt),
        member: token,
      });
      migrated++;
    }
    await redis().zrem(LEGACY_INDEX_KEY, token);
  }
  return migrated;
}

// ---------------------------------------------------------------------------
// Allowlist
// ---------------------------------------------------------------------------

export async function listAllowedUsers(): Promise<AllowedUser[]> {
  const hash = await redis().hgetall<Record<string, AllowedUser>>(ALLOWLIST_KEY);
  return Object.values(hash ?? {}).sort((a, b) => a.addedAt.localeCompare(b.addedAt));
}

export async function addAllowedUser(user: AllowedUser): Promise<void> {
  await redis().hset(ALLOWLIST_KEY, { [user.email]: user });
}

export async function removeAllowedUser(email: string): Promise<void> {
  await redis().hdel(ALLOWLIST_KEY, email);
}

export async function isEmailAllowed(email: string): Promise<boolean> {
  return (await redis().hexists(ALLOWLIST_KEY, email)) === 1;
}

// ---------------------------------------------------------------------------
// Sync tokens (one active token per user; only the SHA-256 is stored)
// ---------------------------------------------------------------------------

export async function setSyncToken(email: string, hash: string): Promise<void> {
  const oldHash = await redis().get<string>(USER_SYNC_TOKEN_KEY(email));
  if (oldHash) await redis().del(SYNC_TOKEN_KEY(oldHash));
  await Promise.all([
    redis().set(SYNC_TOKEN_KEY(hash), email),
    redis().set(USER_SYNC_TOKEN_KEY(email), hash),
  ]);
}

export async function getSyncTokenEmail(hash: string): Promise<string | null> {
  return await redis().get<string>(SYNC_TOKEN_KEY(hash));
}

export async function revokeSyncToken(email: string): Promise<void> {
  const hash = await redis().get<string>(USER_SYNC_TOKEN_KEY(email));
  await Promise.all([
    hash ? redis().del(SYNC_TOKEN_KEY(hash)) : Promise.resolve(),
    redis().del(USER_SYNC_TOKEN_KEY(email)),
  ]);
}

export async function hasSyncToken(email: string): Promise<boolean> {
  return (await redis().exists(USER_SYNC_TOKEN_KEY(email))) === 1;
}

// ---------------------------------------------------------------------------
// Pending invoices (PDFs retained until the local app syncs them)
// ---------------------------------------------------------------------------

export async function addPendingInvoice(p: PendingInvoice): Promise<void> {
  await Promise.all([
    redis().set(PENDING_KEY(p.id), p, { ex: PENDING_TTL_SECONDS }),
    redis().zadd(USER_PENDING_KEY(p.ownerEmail), {
      score: Date.parse(p.createdAt),
      member: p.id,
    }),
  ]);
}

export async function listPendingInvoices(
  email: string,
): Promise<PendingInvoiceMeta[]> {
  const ids = await redis().zrange<string[]>(USER_PENDING_KEY(email), 0, -1);
  if (!ids.length) return [];

  const pipeline = redis().pipeline();
  for (const id of ids) pipeline.get(PENDING_KEY(id));
  const results = await pipeline.exec<(PendingInvoice | null)[]>();

  const metas: PendingInvoiceMeta[] = [];
  const expired: string[] = [];
  for (let i = 0; i < ids.length; i++) {
    const p = results[i];
    if (!p) {
      expired.push(ids[i]); // TTL fired; prune the index entry
      continue;
    }
    const { pdfBase64: _pdf, ...meta } = p;
    metas.push(meta);
  }
  if (expired.length) {
    await redis().zrem(USER_PENDING_KEY(email), ...expired);
  }
  return metas;
}

export async function getPendingInvoice(id: string): Promise<PendingInvoice | null> {
  return await redis().get<PendingInvoice>(PENDING_KEY(id));
}

export async function deletePendingInvoice(id: string): Promise<void> {
  const p = await redis().get<PendingInvoice>(PENDING_KEY(id));
  await Promise.all([
    redis().del(PENDING_KEY(id)),
    p
      ? redis().zrem(USER_PENDING_KEY(p.ownerEmail), id)
      : Promise.resolve(),
  ]);
}
