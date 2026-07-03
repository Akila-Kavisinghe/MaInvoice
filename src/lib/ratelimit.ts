import { Redis } from "@upstash/redis";
import { redisEnv } from "./store-redis";

/**
 * Fixed-window rate limiter for password attempts.
 *
 * Uses Upstash Redis when configured (production / Vercel — serverless
 * instances don't share memory, so an in-memory limiter is ineffective there)
 * and falls back to an in-memory map for zero-config local development.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

// ---------------------------------------------------------------------------
// In-memory backend (local dev, single instance)
// ---------------------------------------------------------------------------

interface Bucket {
  count: number;
  resetAt: number; // unix ms
}

const buckets = new Map<string, Bucket>();

/** Drop expired buckets so the map can't grow without bound. */
function sweep(now: number): void {
  if (buckets.size < 1000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(key);
  }
}

function rateLimitMemory(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  sweep(now);
  const existing = buckets.get(key);

  if (!existing || existing.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  const allowed = existing.count <= limit;
  return {
    allowed,
    remaining: Math.max(0, limit - existing.count),
    retryAfterSeconds: allowed ? 0 : Math.ceil((existing.resetAt - now) / 1000),
  };
}

// ---------------------------------------------------------------------------
// Redis backend (production — shared across serverless instances)
// ---------------------------------------------------------------------------

let client: Redis | null = null;
function redis(): Redis | null {
  if (!client) {
    const env = redisEnv();
    if (!env) return null;
    client = new Redis(env);
  }
  return client;
}

async function rateLimitRedis(
  r: Redis,
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const redisKey = `ratelimit:${key}`;
  const count = await r.incr(redisKey);
  if (count === 1) await r.pexpire(redisKey, windowMs);

  const allowed = count <= limit;
  let retryAfterSeconds = 0;
  if (!allowed) {
    const ttlMs = await r.pttl(redisKey);
    retryAfterSeconds = ttlMs > 0 ? Math.ceil(ttlMs / 1000) : Math.ceil(windowMs / 1000);
  }
  return { allowed, remaining: Math.max(0, limit - count), retryAfterSeconds };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function rateLimit(
  key: string,
  limit = 5,
  windowMs = 5 * 60 * 1000,
): Promise<RateLimitResult> {
  const r = redis();
  if (r) {
    try {
      return await rateLimitRedis(r, key, limit, windowMs);
    } catch {
      // Redis hiccup: fall back to the (per-instance) in-memory limiter
      // rather than letting password attempts through unmetered.
    }
  }
  return rateLimitMemory(key, limit, windowMs);
}

/** Reset a key after a successful login so good actors aren't penalised. */
export async function clearRateLimit(key: string): Promise<void> {
  buckets.delete(key);
  const r = redis();
  if (r) {
    try {
      await r.del(`ratelimit:${key}`);
    } catch {
      /* best effort */
    }
  }
}

/** Best-effort client IP from common proxy headers. */
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}
