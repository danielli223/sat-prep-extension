// Calculator (Decision D7). GeoGebra is embedded INSIDE the shadow root (integrated, free).
// "Open real Desmos" launches desmos.com's own free public site in a SEPARATE window — never an
// iframe — the zero-license fallback (Open item O1). Returns the new visibility (true=open).

import { extrasSlot } from './host';

const GEOGEBRA_URL = 'https://www.geogebra.org/calculator';
const DESMOS_URL = 'https://www.desmos.com/calculator';

export function toggleGeoGebra(root: ShadowRoot): boolean {
  // Mount into the persistent extras slot — NOT the card slot — so advancing to the next question
  // (which repaints the card via renderCard) doesn't wipe an open calculator.
  const slot = extrasSlot(root);
  const existing = slot.querySelector('iframe.fp-geogebra');
  if (existing) { existing.remove(); return false; }
  const iframe = root.ownerDocument!.createElement('iframe');
  iframe.className = 'fp-geogebra';
  iframe.src = GEOGEBRA_URL;
  iframe.title = 'GeoGebra calculator';
  iframe.setAttribute('allow', 'fullscreen');
  slot.appendChild(iframe);
  return true;
}

export function openDesmos(): void {
  // Separate pinned window — the real test-day tool, on its own free site. Not an iframe. Null the
  // opener link explicitly: the non-standard `noopener` windowFeatures token is honored by Chrome
  // but ignored by some engines, so harden it in code rather than rely on the string token.
  const win = window.open(DESMOS_URL, 'fp-desmos', 'width=420,height=640');
  if (win) win.opener = null;
}
