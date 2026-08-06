// First-party promo slot for the journal/progress panel (rendered at the top, under the header).
//
// This is OUR OWN creative only — never a third-party ad network, never a remote fetch, never
// anything keyed off College Board content. Rules that keep this inside the bright lines:
//   * The creative is a static constant in this file. No network call, no tracking pixel, no
//     ad-network SDK, so nothing about the student's session leaves the browser (invariant #2).
//   * Nothing here reads CB DOM, question text, or taxonomy — the promo is identical on every
//     question and is never targeted from CB content (invariants #1/#3).
//   * Copy must not imply College Board affiliation or endorsement (invariant #5); keep "SAT" /
//     "College Board" out of the promo's product branding.
//
// To swap in a real promo: edit PROMO below. To hide the slot entirely: set PROMO = null.

import { esc } from './escape';

export interface Promo {
  /** Small uppercase kicker above the title, e.g. "From the makers". */
  eyebrow?: string;
  title: string;
  body: string;
  /** Button label. */
  cta: string;
  /** Destination. Must be http(s); anything else is dropped (no javascript:/data: URLs). */
  url: string;
  /** Optional single character/emoji shown in the thumbnail square. */
  badge?: string;
}

// ---------------------------------------------------------------------------
// PLACEHOLDER CREATIVE — replace with your real product, or set to null to hide.
// ---------------------------------------------------------------------------
export const PROMO: Promo | null = {
  eyebrow: 'From the makers of this extension',
  title: 'Your Product Name',
  body: 'One line about what it does and why a student grinding practice questions would care. Around 90–140 characters reads best here.',
  cta: 'Check it out',
  url: 'https://example.com',
  badge: '★',
};

function safeUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

/**
 * Markup for the promo slot, or '' when there is nothing to show (null promo, blank title, or a
 * non-http(s) URL). Caller writes this through host.ts's html() like every other panel block.
 */
export function promoHtml(promo: Promo | null = PROMO): string {
  if (!promo || !promo.title.trim()) return '';
  const href = safeUrl(promo.url);
  if (!href) return '';

  const eyebrow = promo.eyebrow
    ? `<div class="fp-promo-eyebrow">${esc(promo.eyebrow)}</div>`
    : '';
  const badge = promo.badge
    ? `<div class="fp-promo-badge" aria-hidden="true">${esc(promo.badge)}</div>`
    : '';

  return `<aside class="fp-promo" aria-label="Sponsored message">
    ${badge}
    <div class="fp-promo-text">
      ${eyebrow}
      <div class="fp-promo-title">${esc(promo.title)}</div>
      <p class="fp-promo-body">${esc(promo.body)}</p>
      <a class="fp-promo-cta" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(promo.cta)}</a>
    </div>
  </aside>`;
}
