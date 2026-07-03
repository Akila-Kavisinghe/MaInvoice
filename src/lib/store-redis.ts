import { Redis } from "@upstash/redis";
import type { Gig, Submission } from "./types";
import { combineSubmissions, submissionKey } from "./submissions";

/**
 * Upstash Redis store — serverless-friendly, used in production (Vercel).
 *
 * Data model:
 *   gig:<token>       -> Gig object (JSON). Older records may still embed a
 *                        `submissions` array (the pre-hash model); those are
 *                        merged in on read.
 *   gig:<token>:subs  -> hash of email-key -> Submission (JSON). One HSET per
 *                        submission, so concurrent bandmates can never clobber
 *                        each other — a read-modify-write on the gig object
 *                        could lose one of two simultaneous submissions.
 *   gigs:index        -> sorted set of tokens, scored by creation time.
 */

const GIG_KEY = (token: string) => `gig:${token}`;
const SUBS_KEY = (token: string) => `gig:${token}:subs`;
const INDEX_KEY = "gigs:index";

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

export async function getGig(token: string): Promise<Gig | null> {
  const [gig, subs] = await Promise.all([
    redis().get<Gig>(GIG_KEY(token)),
    redis().hgetall<Record<string, Submission>>(SUBS_KEY(token)),
  ]);
  return gig ? withSubmissions(gig, subs) : null;
}

export async function saveGig(gig: Gig): Promise<void> {
  await Promise.all([
    redis().set(GIG_KEY(gig.token), gig),
    redis().zadd(INDEX_KEY, { score: Date.parse(gig.createdAt), member: gig.token }),
  ]);
}

export async function listGigs(): Promise<Gig[]> {
  // Newest first.
  const tokens = await redis().zrange<string[]>(INDEX_KEY, 0, -1, { rev: true });
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

export async function deleteGig(token: string): Promise<void> {
  await Promise.all([
    redis().del(GIG_KEY(token)),
    redis().del(SUBS_KEY(token)),
    redis().zrem(INDEX_KEY, token),
  ]);
}
