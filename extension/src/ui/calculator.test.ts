import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mountHost } from './host';
import { renderCard } from './card';
import { toCardVM, type LiveContent } from './view-model';
import { toggleGeoGebra, openDesmos } from './calculator';
import type { QuestionView } from '../cb/reader';

beforeEach(() => { document.body.innerHTML = ''; });

const noop = () => ({
  onSelect: vi.fn(), onEliminate: vi.fn(), onCheck: vi.fn(), onReveal: vi.fn(), onNote: vi.fn(),
  onNext: vi.fn(), onToggleCalc: vi.fn(), onOpenDesmos: vi.fn(), onClose: vi.fn(),
});
const sampleView: QuestionView = {
  id: 'ab12cd34', section: 'Math', domain: 'Algebra', skill: 'Linear', difficulty: 'Hard',
  stem: 'stem [SYNTHETIC]', stemHtml: 'stem [SYNTHETIC]', choices: [{ letter: 'A', text: '1' }, { letter: 'B', text: '2' }],
  correctAnswer: 'B', explanation: null,
};
const live: LiveContent = { stem: sampleView.stem, stemHtml: sampleView.stemHtml, explanationGetter: () => null };

describe('toggleGeoGebra', () => {
  it('mounts a GeoGebra iframe into the shadow root on first toggle', () => {
    const shadow = mountHost(document);
    const onAfterFirst = toggleGeoGebra(shadow);
    const iframe = shadow.querySelector('.fp-geogebra iframe') as HTMLIFrameElement | null;
    expect(iframe).not.toBeNull();
    expect(iframe!.src).toBe('https://www.geogebra.org/calculator');
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

  it('sizes the panel as a fixed floating box so the FULL calculator shows (not the default box)', () => {
    // Regression: .fp-geogebra had no CSS rule, so it fell back to the browser default (~300x150) in
    // static flow and only a slice — the keyboard — was visible ("not shown in complete"). The fix
    // gives the panel an explicit size and fixed positioning; the iframe fills it.
    const shadow = mountHost(document);
    toggleGeoGebra(shadow);
    const panel = shadow.querySelector('.fp-geogebra') as HTMLElement;
    const cs = getComputedStyle(panel);
    expect(cs.position).toBe('fixed');                 // floating panel, not collapsed static flow
    for (const dim of [cs.width, cs.height]) {
      expect(dim).not.toBe('');                        // an explicit size was applied...
      expect(dim).not.toBe('auto');
      expect(dim).not.toBe('0px');
      expect(dim).toMatch(/\d+\s*(px|vw|vh|%)/);        // ...as a real length, not a default
    }
  });

  it('docks clear of the right-docked journal panel and stacks above it (no overlap, never hidden)', () => {
    // Regression: the calculator and the .fp-panel journal were BOTH right-docked, so they overlapped
    // and one hid the other. Fix: dock the calculator bottom-LEFT, and give its stacking layer
    // (.fp-extras-slot) an explicit z-index above the panel so it can never be buried underneath.
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

  it('survives a card re-render: the open calculator is NOT clobbered when renderCard repaints', () => {
    const shadow = mountHost(document);
    renderCard(shadow, toCardVM(sampleView, 0, 1), live, noop());
    toggleGeoGebra(shadow);                       // open the calculator over the card
    expect(shadow.querySelector('.fp-geogebra')).not.toBeNull();

    // Advancing to the next question repaints the card. The calculator must persist (it lives in a
    // sibling slot, not the card slot renderCard overwrites).
    renderCard(shadow, toCardVM({ ...sampleView, id: 'ef56ab78' }, 1, 1), live, noop());
    expect(shadow.querySelector('.fp-geogebra')).not.toBeNull();
    expect(shadow.querySelector('.fp-card')).not.toBeNull();   // and the new card is present
  });
});

describe('openDesmos', () => {
  it('opens desmos.com/calculator in a separate window (not an iframe)', () => {
    const spy = vi.fn();
    vi.stubGlobal('open', spy);
    openDesmos();
    expect(spy).toHaveBeenCalledWith('https://www.desmos.com/calculator', 'fp-desmos', expect.stringContaining('width='));
    vi.unstubAllGlobals();
  });
});
