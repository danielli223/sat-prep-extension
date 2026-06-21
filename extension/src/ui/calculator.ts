// Calculator (Decision D7). There is ONE calculator, and it IS the real Desmos — the test-day tool
// (issue #17). Nothing is embedded in-page: openDesmos() launches desmos.com's own free public site
// in a SEPARATE window — never an iframe — the zero-license fallback (Open item O1).

const DESMOS_URL = 'https://www.desmos.com/calculator';

export function openDesmos(): void {
  // The real test-day tool on its own free site — a new window, NEVER an iframe (the zero-license
  // fallback, Open item O1: we don't embed desmos.com, so it can't be docked *inside* the page).
  //
  // Issue #37: dock it to the SIDE of the screen instead of a default floating window — a tall, narrow
  // window flush to the right edge of the display, echoing College Board's side-docked Math calculator.
  // This is the closest honest match to in-page docking for an external site we never iframe.
  //
  // Still `_blank` + the standard `noopener` token, NOT a reusable named target: a named target
  // ('fp-desmos') plus a nulled opener meant a second click re-navigated the now-cross-origin
  // (desmos.com) named window without being its opener — which Chrome blocks as "Unsafe attempt to
  // initiate navigation" (live 2026-06-16). `noopener` also makes window.open return null, so we hold
  // no handle to disown. The `popup` + width/height/left/top features ask the browser for a positioned
  // window rather than a tab; they coexist with `noopener`.
  const scr = window.screen as Screen & { availLeft?: number; availTop?: number };
  // availWidth/Height can be 0 under non-browser test runtimes — fall back to a sane desktop size.
  const availW = scr.availWidth || 1280;
  const availH = scr.availHeight || 800;
  const originX = scr.availLeft ?? 0;
  const originY = scr.availTop ?? 0;
  const width = Math.max(380, Math.min(460, Math.round(availW * 0.4)));
  const left = originX + availW - width; // flush to the right edge
  const features =
    `noopener,noreferrer,popup,width=${width},height=${availH},left=${left},top=${originY}`;
  window.open(DESMOS_URL, '_blank', features);
}
