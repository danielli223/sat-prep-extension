import { describe, it, expect, vi, beforeEach } from 'vitest';
import { openDesmos } from './calculator';
// Namespace import so a removed named export (the deleted GeoGebra toggle) doesn't break the import.
import * as calc from './calculator';

beforeEach(() => { document.body.innerHTML = ''; });

describe('calculator module surface (issue #17 — one calculator, and it IS Desmos)', () => {
  it('no longer exports a GeoGebra in-page toggle (the embed is removed)', () => {
    // The single calculator opens the real Desmos externally; there is no in-page GeoGebra embed,
    // so toggleGeoGebra must be gone from the module surface.
    expect((calc as Record<string, unknown>).toggleGeoGebra).toBeUndefined();
  });
});

describe('openDesmos', () => {
  it('opens desmos.com docked to the side: a positioned _blank popup with noopener (no disownable handle)', () => {
    // Issue #37: open the real Desmos docked to the SIDE of the screen — a positioned window
    // (popup + width/height/left/top, flush to the right edge) instead of a default floating window.
    // Regression (live 2026-06-16): opening with a NAMED target ('fp-desmos') and then nulling
    // win.opener meant a SECOND click tried to re-navigate the now-cross-origin (desmos.com) named
    // window without being its opener — Chrome blocks that as "Unsafe attempt to initiate navigation".
    // Use _blank (a new window each click, nothing to re-navigate) + the standard `noopener` token
    // (prevents reverse-tabnabbing AND makes window.open return null, so we never hold/disown a handle).
    // The positioning features coexist with noopener and never reintroduce a reusable named target.
    const spy = vi.fn((..._args: unknown[]) => null);
    vi.stubGlobal('open', spy);
    openDesmos();
    expect(spy).toHaveBeenCalledTimes(1);
    const [url, target, features] = spy.mock.calls[0]!;
    expect(url).toBe('https://www.desmos.com/calculator');
    expect(target).toBe('_blank');                       // NOT a reusable named target
    expect(features).toMatch(/\bnoopener\b/);
    // Docked-to-the-side window geometry (issue #37): a positioned popup, not a default floating window.
    expect(features).toMatch(/\bpopup\b/);
    expect(features).toMatch(/\bwidth=\d+/);
    expect(features).toMatch(/\bheight=\d+/);
    expect(features).toMatch(/\bleft=\d+/);
    expect(features).toMatch(/\btop=\d+/);
    vi.unstubAllGlobals();
  });
});
