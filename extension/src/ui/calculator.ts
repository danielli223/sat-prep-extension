// Calculator (Decision D7). GeoGebra is embedded INSIDE the shadow root (integrated, free).
// "Open real Desmos" launches desmos.com's own free public site in a SEPARATE window — never an
// iframe — the zero-license fallback (Open item O1). Returns the new visibility (true=open).

import { extrasSlot } from './host';

// The SCIENTIFIC app, not the graphing one (/calculator): it opens straight to a button keypad
// (digits, operators, √, π, fractions, exponents) — the visible calculator students expect, close to
// the Desmos SAT keypad — instead of an axes grid with the math keyboard tucked away.
const GEOGEBRA_URL = 'https://www.geogebra.org/scientific';
const DESMOS_URL = 'https://www.desmos.com/calculator';

export function toggleGeoGebra(root: ShadowRoot): boolean {
  // Mount into the persistent extras slot — NOT the card slot — so the start panel (which writes
  // the card slot) doesn't wipe an open calculator, and vice versa.
  const slot = extrasSlot(root);
  const existing = slot.querySelector('.fp-geogebra');
  if (existing) { existing.remove(); return false; }
  const doc = root.ownerDocument!;
  // The calculator is a floating PANEL (.fp-geogebra) with a header bar carrying a ✕, so it can be
  // dismissed directly — matching the focus card / start panel — without re-toggling the card button.
  const panel = doc.createElement('div');
  panel.className = 'fp-geogebra';
  const head = doc.createElement('div');
  head.className = 'fp-geogebra-head';
  const label = doc.createElement('span');
  label.textContent = 'Calculator';
  const close = doc.createElement('button');
  close.className = 'fp-geogebra-close';
  close.setAttribute('aria-label', 'Close calculator');
  close.textContent = '✕';
  close.addEventListener('click', () => panel.remove());
  head.append(label, close);
  const iframe = doc.createElement('iframe');
  iframe.className = 'fp-geogebra-frame';
  iframe.src = GEOGEBRA_URL;
  iframe.title = 'GeoGebra calculator';
  iframe.setAttribute('allow', 'fullscreen');
  panel.append(head, iframe);
  slot.appendChild(panel);
  return true;
}

export function openDesmos(): void {
  // The real test-day tool on its own free site — a new window, never an iframe. Open with `_blank`
  // and the standard `noopener` token, NOT a reusable named target. A named target ('fp-desmos') plus
  // a nulled opener meant a second click re-navigated the now-cross-origin (desmos.com) named window
  // without being its opener — which Chrome blocks as "Unsafe attempt to initiate navigation" (live
  // 2026-06-16). `noopener` also makes window.open return null, so we hold no handle to disown.
  window.open(DESMOS_URL, '_blank', 'noopener,noreferrer');
}
