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

// Built-in vector marks for the thumbnail square. Keyed by id rather than accepted as free-form
// markup, so the raw-SVG insert below can never carry caller-supplied HTML — a `mark` that isn't in
// this table renders nothing. Add a product here to give it a logo instead of a text badge.
const MARKS = {
  // Oasis Focus "drop shield" (oasis-focus/docs/brand/_masters/mark.svg), recoloured sand-on-teal.
  oasis:
    '<svg viewBox="0 0 1024 1024" width="24" height="24" aria-hidden="true" focusable="false">' +
    '<path fill="#F5EFE4" fill-rule="evenodd" ' +
    'transform="translate(512 512) scale(1.0610120481927712) translate(-512 -515)" ' +
    'd="M 512 100 C 566 246 802 386 802 640 A 290 290 0 0 1 222 640 C 222 386 458 246 512 100 Z ' +
    'M 512 480 C 558 500 612 510 654 510 C 660 618 608 726 512 794 C 416 726 364 618 370 510 ' +
    'C 412 510 466 500 512 480 Z"/></svg>',
} as const;

export type MarkId = keyof typeof MARKS;

export interface Promo {
  /** Bold uppercase heading across the top of the card, e.g. "More from this developer". */
  eyebrow?: string;
  title: string;
  body: string;
  /** Button label. */
  cta: string;
  /** Destination. Must be http(s); anything else is dropped (no javascript:/data: URLs). */
  url: string;
  /** Optional single character/emoji shown in the thumbnail square. Ignored when `mark` is set. */
  badge?: string;
  /** Optional built-in logo for the thumbnail square. Takes precedence over `badge`. */
  mark?: MarkId;
}

// ---------------------------------------------------------------------------
// CURRENT CREATIVE — our own other product. Set to null to hide the slot.
// ---------------------------------------------------------------------------
export const PROMO: Promo | null = {
  eyebrow: 'More from this developer',
  title: 'Oasis Focus',
  body:
    "Blocks the sites and apps that eat your study time behind a lock you can't undo until the " +
    'timer ends. Free to start on Mac and Chrome.',
  cta: 'Get Oasis Focus',
  url: 'https://oasisfocus.com',
  mark: 'oasis',
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

  // Heading sits above the badge/text row (not beside the title) so "more from this developer" is
  // the first thing read, and the slot can never be mistaken for the student's own journal data.
  const eyebrow = promo.eyebrow
    ? `<div class="fp-promo-eyebrow">${esc(promo.eyebrow)}</div>`
    : '';

  // `mark` indexes the MARKS table above — a fixed set of our own SVGs — so nothing caller-supplied
  // reaches the page unescaped. Falls back to the escaped text badge.
  const markSvg = promo.mark ? MARKS[promo.mark] : undefined;
  const badge = markSvg
    ? `<div class="fp-promo-badge fp-promo-badge-${esc(promo.mark as string)}" aria-hidden="true">${markSvg}</div>`
    : promo.badge
      ? `<div class="fp-promo-badge" aria-hidden="true">${esc(promo.badge)}</div>`
      : '';

  return `<aside class="fp-promo" aria-label="Sponsored message">
    ${eyebrow}
    <div class="fp-promo-main">
      ${badge}
      <div class="fp-promo-text">
        <div class="fp-promo-title">${esc(promo.title)}</div>
        <p class="fp-promo-body">${esc(promo.body)}</p>
        <a class="fp-promo-cta" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(promo.cta)}</a>
      </div>
    </div>
  </aside>`;
}
