import { hashSyncToken } from "./auth";
import { getSyncTokenEmail } from "./store";

/**
 * Resolve the owner of a `Authorization: Bearer mis_…` sync token, used by the
 * /api/sync/* routes the local library app calls. Lookup is by SHA-256 hash of
 * the presented token (never string comparison), so there is no timing concern
 * and a store dump never reveals usable tokens.
 */
export async function syncUser(req: Request): Promise<string | null> {
  const m = req.headers.get("authorization")?.match(/^Bearer (mis_[\w-]+)$/);
  if (!m) return null;
  return getSyncTokenEmail(hashSyncToken(m[1]));
}
