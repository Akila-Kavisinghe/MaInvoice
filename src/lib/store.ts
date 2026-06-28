/**
 * Storage facade. Picks a backend based on the environment:
 *
 *   - Upstash Redis  → when UPSTASH_REDIS_REST_URL is set (production / Vercel)
 *   - JSON file      → otherwise (zero-config local development)
 *
 * The rest of the app depends only on the five functions re-exported here, so
 * swapping or adding a backend is a one-file change.
 */
import * as jsonStore from "./store-json";
import * as redisStore from "./store-redis";

const useRedis = Boolean(process.env.UPSTASH_REDIS_REST_URL);
const store = useRedis ? redisStore : jsonStore;

// The JSON store can't persist on Vercel's read-only filesystem. Reads still
// "work" (they return empty), but writes fail with an opaque error — so guard
// write paths with a clear, actionable message.
function assertWritable(): void {
  if (process.env.VERCEL && !useRedis) {
    throw new Error(
      "Storage not configured: running on Vercel without Upstash Redis. " +
        "Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN, then redeploy.",
    );
  }
}

export const getGig = store.getGig;
export const listGigs = store.listGigs;

export const saveGig: typeof store.saveGig = (gig) => {
  assertWritable();
  return store.saveGig(gig);
};
export const addSubmission: typeof store.addSubmission = (token, submission) => {
  assertWritable();
  return store.addSubmission(token, submission);
};
export const deleteGig: typeof store.deleteGig = (token) => {
  assertWritable();
  return store.deleteGig(token);
};
