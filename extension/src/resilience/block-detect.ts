// CB block detection (spec §8.3). On a block signal we DISABLE and point to CB. We NEVER retry,
// NEVER enumerate, NEVER call the API. This module only READS the already-rendered page — it issues
// no network request of its own. Akamai/CB block pages surface as a bare error page (Akamai
// "Reference #..." signature) with NO question chrome. We scope detection to that structural signal
// so legitimate question content (a passage about "access denied", a math item using 403/429/451)
// can NEVER disable the overlay — failing the product OFF on good content is worse than a missed block.
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

// A legitimately-rendered CB page carries question chrome the reader knows (frozen reader contract):
// a question dialog (.cb-dialog-container / role="dialog") or the results table (table.cb-table-react).
// A CB/Akamai block page has NEITHER — it is a bare error page. If question chrome is present, the
// page is good; we must never disable the overlay over text that lives inside question content.
function hasQuestionChrome(doc: Document): boolean {
  return (
    doc.querySelector('.cb-dialog-container, table.cb-table-react, [role="dialog"]') !== null
  );
}

// Akamai/CB block pages carry a structural error signature: an Akamai "Reference #..." error id.
// "Access Denied" prose is too common to stand alone (a passage about a denied archive), so the
// ACCESS_DENIED reason additionally requires this Akamai signature. The explicit HTTP-status phrases
// below ("403 Forbidden", "429 Too Many Requests", "451") are themselves the structural marker.
const AKAMAI_REFERENCE = /\bReference\s*#\s*[\w.]+/i;

// Block-page markers are HTTP-STATUS PHRASES, not bare numbers: "403 Forbidden" (not a stray 403 in a
// math item), "429"/"Too Many Requests", "451 ... Unavailable". Bare "\b429\b"/"\b451\b" numeric
// matches were the false-positive vector and are intentionally gone.
const FORBIDDEN_MARK = /\b403\b[\s—-]*forbidden|forbidden[\s—-]*\b403\b|\bhttp\s*403\b/i;
const RATE_LIMITED_MARK = /too many requests|\b429\b[\s—-]*too many requests|\b429\b[\s—-]*rate/i;
const UNAVAILABLE_451_MARK = /\b451\b[\s—-]*(unavailable|for legal)/i;

// Read-only DOM classification. Returns a reason ONLY when the rendered page is a CB/Akamai block
// page — it LACKS any legitimate question chrome AND carries an explicit block signal (an HTTP-status
// phrase, or "Access Denied" + the Akamai Reference # signature). Never scans question stems/choices/
// skills for bare numbers or words (that fails the product OFF on good pages).
export function detectBlock(doc: Document): BlockReason | null {
  // Fail safe ON: any legitimate question chrome means this is NOT a block page, full stop.
  if (hasQuestionChrome(doc)) return null;

  const text = (doc.body?.textContent ?? '').slice(0, 4000); // bounded read; never persisted

  // "Access Denied" alone is common prose; only treat it as a block when the Akamai error id is present.
  if (/access denied/i.test(text) && AKAMAI_REFERENCE.test(text)) return BLOCK_REASON.ACCESS_DENIED;
  if (RATE_LIMITED_MARK.test(text)) return BLOCK_REASON.RATE_LIMITED;
  if (FORBIDDEN_MARK.test(text)) return BLOCK_REASON.FORBIDDEN;
  if (UNAVAILABLE_451_MARK.test(text)) return BLOCK_REASON.FORBIDDEN;
  return null;
}
