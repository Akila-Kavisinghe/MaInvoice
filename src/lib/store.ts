/**
 * Storage facade. Picks a backend based on the environment:
 *
 *   - Upstash Redis  → when UPSTASH_REDIS_REST_URL is set (production / Vercel)
 *   - JSON file      → otherwise (zero-config local development)
 *
 * The rest of the app depends only on the functions re-exported here, so
 * swapping or adding a backend is a one-file change.
 */
import type {
  AllowedUser,
  Gig,
  PendingInvoice,
  PendingInvoiceMeta,
  Submission,
} from "./types";
import * as jsonStore from "./store-json";
import * as redisStore from "./store-redis";
import { redisEnv } from "./store-redis";

/** Both backends must satisfy this shape — keeps them from drifting apart. */
export interface StoreBackend {
  getGig(token: string): Promise<Gig | null>;
  saveGig(gig: Gig): Promise<void>;
  listGigs(ownerEmail: string): Promise<Gig[]>;
  addSubmission(token: string, submission: Submission): Promise<void>;
  removeSubmission(token: string, email: string): Promise<void>;
  setGigArchived(token: string, archived: boolean): Promise<void>;
  deleteGig(token: string): Promise<void>;
  migrateLegacyGigs(superAdminEmail: string): Promise<number>;

  listAllowedUsers(): Promise<AllowedUser[]>;
  addAllowedUser(user: AllowedUser): Promise<void>;
  removeAllowedUser(email: string): Promise<void>;
  isEmailAllowed(email: string): Promise<boolean>;

  setSyncToken(email: string, hash: string): Promise<void>;
  getSyncTokenEmail(hash: string): Promise<string | null>;
  revokeSyncToken(email: string): Promise<void>;
  hasSyncToken(email: string): Promise<boolean>;

  addPendingInvoice(p: PendingInvoice): Promise<void>;
  listPendingInvoices(email: string): Promise<PendingInvoiceMeta[]>;
  getPendingInvoice(id: string): Promise<PendingInvoice | null>;
  deletePendingInvoice(id: string): Promise<void>;
}

const useRedis = redisEnv() !== null;
const store: StoreBackend = useRedis ? redisStore : jsonStore;

// The JSON store can't persist on Vercel's read-only filesystem. Reads still
// "work" (they return empty), but writes fail with an opaque error — so guard
// write paths with a clear, actionable message.
function assertWritable(): void {
  if (process.env.VERCEL && !useRedis) {
    throw new Error(
      "Storage not configured: running on Vercel without Upstash Redis. " +
        "Set UPSTASH_REDIS_REST_URL/_TOKEN (or KV_REST_API_URL/_TOKEN), then redeploy.",
    );
  }
}

function writable<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  return (...args) => {
    assertWritable();
    return fn(...args);
  };
}

// Reads
export const getGig = store.getGig;
export const listGigs = store.listGigs;
export const listAllowedUsers = store.listAllowedUsers;
export const isEmailAllowed = store.isEmailAllowed;
export const getSyncTokenEmail = store.getSyncTokenEmail;
export const hasSyncToken = store.hasSyncToken;
export const listPendingInvoices = store.listPendingInvoices;
export const getPendingInvoice = store.getPendingInvoice;

// Writes
export const saveGig = writable(store.saveGig);
export const addSubmission = writable(store.addSubmission);
export const removeSubmission = writable(store.removeSubmission);
export const setGigArchived = writable(store.setGigArchived);
export const deleteGig = writable(store.deleteGig);
export const migrateLegacyGigs = writable(store.migrateLegacyGigs);
export const addAllowedUser = writable(store.addAllowedUser);
export const removeAllowedUser = writable(store.removeAllowedUser);
export const setSyncToken = writable(store.setSyncToken);
export const revokeSyncToken = writable(store.revokeSyncToken);
export const addPendingInvoice = writable(store.addPendingInvoice);
export const deletePendingInvoice = writable(store.deletePendingInvoice);
