import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mountHost } from './host';
import { renderCard } from './card';
import { toCardVM, type LiveContent } from './view-model';
import { toggleGeoGebra, openDesmos } from './calculator';
import type { QuestionView } from '../cb/reader';

beforeEach(() => { document.body.innerHTML = ''; });

const noop = () => ({
  onSelect: vi.fn(), onEliminate: vi.fn(), onCheck: vi.fn(), onReveal: vi.fn(), onNote: vi.fn(),
  onNext: vi.fn(), onToggleCalc: vi.fn(), onOpenDesmos: vi.fn(),
});
const sampleView: QuestionView = {
  id: 'ab12cd34', section: 'Math', domain: 'Algebra', skill: 'Linear', difficulty: 'Hard',
  stem: 'stem [SYNTHETIC]', choices: [{ letter: 'A', text: '1' }, { letter: 'B', text: '2' }],
  correctAnswer: 'B', explanation: null,
};
const live: LiveContent = { stem: sampleView.stem, explanationGetter: () => null };

describe('toggleGeoGebra', () => {
  it('mounts a GeoGebra iframe into the shadow root on first toggle', () => {
    const shadow = mountHost(document);
    const onAfterFirst = toggleGeoGebra(shadow);
    const iframe = shadow.querySelector('iframe.fp-geogebra') as HTMLIFrameElement | null;
    expect(iframe).not.toBeNull();
    expect(iframe!.src).toBe('https://www.geogebra.org/calculator');
    expect(onAfterFirst).toBe(true);   // now visible
  });

  it('removes the iframe on the second toggle (open → closed)', () => {
    const shadow = mountHost(document);
    toggleGeoGebra(shadow);
    const visible = toggleGeoGebra(shadow);
    expect(visible).toBe(false);
    expect(shadow.querySelector('iframe.fp-geogebra')).toBeNull();
  });

  it('survives a card re-render: the open iframe is NOT clobbered when renderCard repaints', () => {
    const shadow = mountHost(document);
    renderCard(shadow, toCardVM(sampleView, 0, 1), live, noop());
    toggleGeoGebra(shadow);                       // open the calculator over the card
    expect(shadow.querySelector('iframe.fp-geogebra')).not.toBeNull();

    // Advancing to the next question repaints the card. The calculator must persist (it lives in a
    // sibling slot, not the card slot renderCard overwrites).
    renderCard(shadow, toCardVM({ ...sampleView, id: 'ef56ab78' }, 1, 1), live, noop());
    expect(shadow.querySelector('iframe.fp-geogebra')).not.toBeNull();
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
