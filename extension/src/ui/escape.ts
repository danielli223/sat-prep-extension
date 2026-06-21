// The SOLE XSS boundary for our UI. host.ts's TrustedTypes policy is the identity transform (NO
// sanitization), so every CB-derived value interpolated into an innerHTML write MUST pass through
// esc() first (contract §2.1 / spec §8.4). Escapes the five HTML-significant characters; & is
// replaced via the same single-pass regex so an already-escaped entity is never double-escaped.
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
