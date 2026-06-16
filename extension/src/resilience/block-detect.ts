// CB block detection (spec §8.3). On a block signal we DISABLE and point to CB. We NEVER retry,
// NEVER enumerate, NEVER call the API. This module only READS the already-rendered page — it issues
// no network request of its own. Akamai/CB block pages surface as 403/429/451 or an access-denied marker.
export const BLOCK_REASON = {
  ACCESS_DENIED: 'access-denied',
  FORBIDDEN: 'forbidden',
  RATE_LIMITED: 'rate-limited',
} as const;
export type BlockReason = (typeof BLOCK_REASON)[keyof typeof BLOCK_REASON];

const BLOCK_STATUSES = new Set([403, 429, 451]);
export function isBlockStatus(status: number): boolean {
  return BLOCK_STATUSES.has(status);
}

// Read-only DOM classification. Returns a reason if this rendered page is a CB block page, else null.
export function detectBlock(doc: Document): BlockReason | null {
  const text = (doc.body?.textContent ?? '').slice(0, 4000); // bounded read; never persisted
  if (/access denied/i.test(text)) return BLOCK_REASON.ACCESS_DENIED;
  if (/\b403\b\s*forbidden/i.test(text)) return BLOCK_REASON.FORBIDDEN;
  if (/\b429\b|too many requests/i.test(text)) return BLOCK_REASON.RATE_LIMITED;
  if (/\b451\b/.test(text)) return BLOCK_REASON.FORBIDDEN;
  return null;
}
