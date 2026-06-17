import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mountHost } from './host';
import { renderCard, renderVerdict } from './card';
import { toCardVM, type LiveContent } from './view-model';
import { score } from '../scoring';
import type { QuestionView } from '../cb/reader';

const mc: QuestionView = {
  id: 'ab12cd34', section: 'Math', domain: 'Algebra', skill: 'Linear equations in one variable',
  difficulty: 'Hard', stem: 'If 3x + 7 = 22, what is x? [SYNTHETIC]',
  stemHtml: 'If 3x + 7 = 22, what is x? [SYNTHETIC]', choices: [
    { letter: 'A', text: '3' }, { letter: 'B', text: '5' }, { letter: 'C', text: '7' }, { letter: 'D', text: '15' },
  ], correctAnswer: 'B', explanation: 'Subtract 7, divide by 3. [SYNTHETIC]',
  explanationHtml: '<p><strong>Correct Answer: B</strong></p><p>Subtract 7, divide by 3. [SYNTHETIC]</p>',
};
const live = (v: QuestionView): LiveContent => ({ stem: v.stem, stemHtml: v.stemHtml, explanationHtmlGetter: () => v.explanationHtml });

beforeEach(() => { document.body.innerHTML = ''; });

function noop() { return {
  onSelect: vi.fn(), onEliminate: vi.fn(), onCheck: vi.fn(), onReveal: vi.fn(), onNote: vi.fn(),
  onNext: vi.fn(), onToggleCalc: vi.fn(), onOpenDesmos: vi.fn(), onClose: vi.fn() }; }

describe('renderCard', () => {
  it('paints trust badge, header, stem, A–D choices, and the controls', () => {
    const shadow = mountHost(document);
    renderCard(shadow, toCardVM(mc, 0, 10), live(mc), noop());
    expect(shadow.querySelector('.fp-trust')!.textContent).toContain('unaltered');
    expect(shadow.querySelector('.fp-progress')!.textContent).toContain('Q 1 of 10');
    expect(shadow.querySelector('.fp-stem')!.textContent).toContain('3x + 7');
    expect(shadow.querySelectorAll('.fp-choice')).toHaveLength(4);
    expect(shadow.querySelector('.fp-check')).not.toBeNull();
    expect(shadow.querySelector('.fp-next')).not.toBeNull();
    expect(shadow.querySelector('.fp-calc-pin')).not.toBeNull();
  });

  it('Check fires onCheck with the selected letter; cross-off fires onEliminate', () => {
    const shadow = mountHost(document);
    const h = noop();
    renderCard(shadow, toCardVM(mc, 0, 1), live(mc), h);
    (shadow.querySelector('.fp-choice[data-letter="B"] .fp-pick') as HTMLElement).click();
    (shadow.querySelector('.fp-choice[data-letter="C"] .fp-eliminate') as HTMLElement).click();
    (shadow.querySelector('.fp-check') as HTMLElement).click();
    expect(h.onSelect).toHaveBeenCalledWith('B');
    expect(h.onEliminate).toHaveBeenCalledWith('C');
    expect(h.onCheck).toHaveBeenCalledWith('B');
  });

  it('renders a ✕ close button that fires onClose', () => {
    const shadow = mountHost(document);
    const h = noop();
    renderCard(shadow, toCardVM(mc, 0, 1), live(mc), h);
    const close = shadow.querySelector('.fp-overlay-close') as HTMLElement;
    expect(close).not.toBeNull();
    expect(close.getAttribute('aria-label')).toBe('Close');
    close.click();
    expect(h.onClose).toHaveBeenCalledOnce();
  });

  it('renders a grid-in input instead of choices for kind "grid"', () => {
    const grid: QuestionView = { ...mc, id: 'ef56ab78', choices: [], correctAnswer: '5' };
    const shadow = mountHost(document);
    renderCard(shadow, toCardVM(grid, 0, 1), live(grid), noop());
    expect(shadow.querySelector('.fp-gridin')).not.toBeNull();
    expect(shadow.querySelectorAll('.fp-choice')).toHaveLength(0);
  });
});

describe('renderVerdict (instant red/green — D4)', () => {
  // The caller marks the correct choice with data-correct="true" before renderVerdict (the loop
  // does this in Task 7); renderVerdict lights GREEN whichever choice carries that hook.
  it('graded correct: lights the chosen choice green, marks correct', () => {
    const shadow = mountHost(document);
    renderCard(shadow, toCardVM(mc, 0, 1), live(mc), noop());
    (shadow.querySelector('.fp-choice[data-letter="B"]') as HTMLElement).dataset.correct = 'true';
    renderVerdict(shadow, { pick: 'B', result: score('B', 'B') }, live(mc));
    expect(shadow.querySelector('.fp-choice[data-letter="B"]')!.classList.contains('fp-correct')).toBe(true);
    expect(shadow.querySelector('.fp-verdict')!.textContent).toContain('Correct');
  });

  it('graded wrong: chosen red, correct green', () => {
    const shadow = mountHost(document);
    renderCard(shadow, toCardVM(mc, 0, 1), live(mc), noop());
    (shadow.querySelector('.fp-choice[data-letter="B"]') as HTMLElement).dataset.correct = 'true';
    renderVerdict(shadow, { pick: 'A', result: score('A', 'B') }, live(mc));
    expect(shadow.querySelector('.fp-choice[data-letter="A"]')!.classList.contains('fp-wrong')).toBe(true);
    expect(shadow.querySelector('.fp-choice[data-letter="B"]')!.classList.contains('fp-correct')).toBe(true);
  });

  it('NEVER-GUESS: graded===false reveals CB answer, shows NO red/green verdict (contract §2.4)', () => {
    const shadow = mountHost(document);
    const unreadable: QuestionView = { ...mc, correctAnswer: null };
    renderCard(shadow, toCardVM(unreadable, 0, 1), live(unreadable), noop());
    renderVerdict(shadow, { pick: 'A', result: { graded: false, correct: false } }, live(unreadable));
    expect(shadow.querySelector('.fp-correct')).toBeNull();
    expect(shadow.querySelector('.fp-wrong')).toBeNull();
    expect(shadow.querySelector('.fp-verdict')!.textContent).toContain("Couldn't grade");
  });
});

describe('explanation reveal (D5 / O6) reads live, labelled unaltered', () => {
  it('Reveal pulls CB explanation at click time, labelled "unaltered"', () => {
    const shadow = mountHost(document);
    renderCard(shadow, toCardVM(mc, 0, 1), live(mc), noop());
    (shadow.querySelector('.fp-reveal') as HTMLElement).click();
    const panel = shadow.querySelector('.fp-explanation')!;
    expect(panel.textContent).toContain('Subtract 7');
    expect(panel.textContent).toContain('unaltered');
  });

  it('renders CB\'s explanation as formatted HTML — bold answer line + separate paragraphs', () => {
    const shadow = mountHost(document);
    renderCard(shadow, toCardVM(mc, 0, 1), live(mc), noop());
    (shadow.querySelector('.fp-reveal') as HTMLElement).click();
    const panel = shadow.querySelector('.fp-explanation')!;
    // The sanitized HTML is injected as real markup (a <strong> element + <p> blocks), not escaped text.
    expect(panel.querySelector('.fp-explanation-body strong')!.textContent).toBe('Correct Answer: B');
    expect(panel.querySelectorAll('.fp-explanation-body p')).toHaveLength(2);
    expect(panel.innerHTML).not.toContain('&lt;p&gt;');   // not double-escaped
  });

  it('note field change fires onNote with the typed text', () => {
    const shadow = mountHost(document);
    const h = noop();
    renderCard(shadow, toCardVM(mc, 0, 1), live(mc), h);
    const field = shadow.querySelector('.fp-note') as HTMLTextAreaElement;
    field.value = 'fell for the trap';
    field.dispatchEvent(new Event('change'));
    expect(h.onNote).toHaveBeenCalledWith('fell for the trap');
  });
});
