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

export const getGig = store.getGig;
export const saveGig = store.saveGig;
export const listGigs = store.listGigs;
export const addSubmission = store.addSubmission;
export const deleteGig = store.deleteGig;
