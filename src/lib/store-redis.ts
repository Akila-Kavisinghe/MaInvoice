import { Redis } from "@upstash/redis";
import type { Gig, Submission } from "./types";

/**
 * Upstash Redis store — serverless-friendly, used in production (Vercel).
 *
 * Data model:
 *   gig:<token>   -> Gig object (JSON, includes its submissions)
 *   gigs:index    -> sorted set of tokens, scored by creation time (for listing)
 */

const GIG_KEY = (token: string) => `gig:${token}`;
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

export async function getGig(token: string): Promise<Gig | null> {
  return (await redis().get<Gig>(GIG_KEY(token))) ?? null;
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
  const gigs = await redis().mget<Gig[]>(...tokens.map(GIG_KEY));
  return gigs.filter((g): g is Gig => g != null);
}

export async function addSubmission(
  token: string,
  submission: Submission,
): Promise<void> {
  const gig = await getGig(token);
  if (!gig) return;
  gig.submissions = [...(gig.submissions ?? []), submission];
  await redis().set(GIG_KEY(token), gig);
}

export async function deleteGig(token: string): Promise<void> {
  await Promise.all([
    redis().del(GIG_KEY(token)),
    redis().zrem(INDEX_KEY, token),
  ]);
}
