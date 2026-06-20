import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mountHost } from './host';
import { toggleGeoGebra, openDesmos } from './calculator';

beforeEach(() => { document.body.innerHTML = ''; });

describe('toggleGeoGebra', () => {
  it('mounts the GeoGebra SCIENTIFIC calculator iframe (button keypad, not the graphing grid)', () => {
    // The graphing app (/calculator) opens to an axes grid with the math keypad hidden; students
    // wanted a visible Desmos-style keypad. The /scientific app shows that button keypad up front.
    const shadow = mountHost(document);
    const onAfterFirst = toggleGeoGebra(shadow);
    const iframe = shadow.querySelector('.fp-geogebra iframe') as HTMLIFrameElement | null;
    expect(iframe).not.toBeNull();
    expect(iframe!.src).toBe('https://www.geogebra.org/scientific');
    expect(onAfterFirst).toBe(true);   // now visible
  });

  it('removes the iframe on the second toggle (open → closed)', () => {
    const shadow = mountHost(document);
    toggleGeoGebra(shadow);
    const visible = toggleGeoGebra(shadow);
    expect(visible).toBe(false);
    expect(shadow.querySelector('.fp-geogebra')).toBeNull();
  });

  it('closes the calculator when its ✕ button is clicked (direct dismiss, no second toggle)', () => {
    const shadow = mountHost(document);
    toggleGeoGebra(shadow);
    const close = shadow.querySelector('.fp-geogebra-close') as HTMLButtonElement | null;
    expect(close).not.toBeNull();
    close!.click();
    expect(shadow.querySelector('.fp-geogebra')).toBeNull();      // panel gone…
    expect(shadow.querySelector('.fp-geogebra iframe')).toBeNull(); // …iframe with it
  });

  it('sizes the side-docked panel with explicit fixed dimensions so the FULL calculator shows', () => {
    // Regression: .fp-geogebra had no CSS rule, so it fell back to the browser default (~300x150) in
    // static flow and only a slice — the keyboard — was visible ("not shown in complete"). The panel
    // now docks full-height to the side (issue #37) but still needs explicit fixed dimensions so the
    // iframe fills a real box, not a collapsed static-flow default.
    const shadow = mountHost(document);
    toggleGeoGebra(shadow);
    const panel = shadow.querySelector('.fp-geogebra') as HTMLElement;
    const cs = getComputedStyle(panel);
    expect(cs.position).toBe('fixed');                 // docked panel, not collapsed static flow
    for (const dim of [cs.width, cs.height]) {
      expect(dim).not.toBe('');                        // an explicit size was applied...
      expect(dim).not.toBe('auto');
      expect(dim).not.toBe('0px');
      expect(dim).toMatch(/\d+\s*(px|vw|vh|%)/);        // ...as a real length, not a default
    }
  });

  it('docks clear of the right-docked journal panel and stacks above it (no overlap, never hidden)', () => {
    // Regression: the calculator and the .fp-panel journal were BOTH right-docked, so they overlapped
    // and one hid the other. Fix: dock the calculator to the LEFT edge (issue #37 docks it full-height
    // there; the journal owns the right), and give its stacking layer (.fp-extras-slot) an explicit
    // z-index above the panel so it can never be buried underneath.
    const shadow = mountHost(document);
    toggleGeoGebra(shadow);
    const calc = shadow.querySelector('.fp-geogebra') as HTMLElement;
    const cs = getComputedStyle(calc);
    expect(cs.left).toMatch(/\d/);                     // docked left (not the right edge the panel owns)

    // Compare the two stacking layers. The panel rule applies by class even on a bare element.
    const extras = shadow.querySelector('.fp-extras-slot') as HTMLElement;
    const panel = document.createElement('section');
    panel.className = 'fp-panel';
    shadow.appendChild(panel);
    const zExtras = Number(getComputedStyle(extras).zIndex);
    const zPanel = Number(getComputedStyle(panel).zIndex);
    expect(zExtras).toBeGreaterThan(zPanel);           // calculator layer is above the panel
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
