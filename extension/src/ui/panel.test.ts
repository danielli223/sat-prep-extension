import { describe, it, expect } from 'vitest';
import { renderPanel, type PanelVM } from './panel';
import type { Stats } from '../stats';
import type { Mistake } from '../journal';
import type { Attempt } from '../types';
import { makeAttempt } from '../model';

function shadow(): ShadowRoot {
  const hostEl = document.createElement('div');
  document.body.appendChild(hostEl);
  return hostEl.attachShadow({ mode: 'open' });
}

const stats: Stats = {
  total: 12, correct: 9, accuracy: 0.75,
  perSkill: [
    { skill: 'Inferences', total: 4, correct: 1, accuracy: 0.25 },
    { skill: 'Linear equations', total: 8, correct: 8, accuracy: 1 },
  ],
  seen: {}, streakDays: 3,
};
const mistakes: Mistake[] = [
  { questionId: 'ab12cd34', skill: 'Inferences', difficulty: 'Hard', lastSeenAt: '2026-06-13T00:00:00.000Z', note: 'fell for the trap' },
];
const vm: PanelVM = { stats, mistakes };

describe('renderPanel', () => {
  it('shows done/accuracy/streak stats', () => {
    const root = shadow();
    renderPanel(root, vm);
    const text = root.textContent ?? '';
    expect(text).toContain('12');     // done (total)
    expect(text).toContain('75%');    // accuracy
    expect(text).toContain('3');      // streak days
  });

  it('renders weak-area bars worst-first with NO dead Practice-on-CB link (#33)', () => {
    const root = shadow();
    renderPanel(root, vm);
    const bars = [...root.querySelectorAll('.fp-weak-area')];
    expect(bars[0]!.textContent).toContain('Inferences');         // 25% worst → first (ordering preserved)
    expect(bars[1]!.textContent).toContain('Linear equations');   // 100% → last
    // Issue #33: the bare-/search "Practice X on CB" link was dead (dumped the student on the QB home);
    // a per-question deep-link is impossible, so the link is removed entirely.
    expect(bars[0]!.querySelector('a.fp-practice-link')).toBeNull();
    expect(root.querySelector('a.fp-practice-link')).toBeNull();   // no Practice link anywhere in the panel
  });

  it('renders the mistakes list with note + id/skill/difficulty/date and NO dead Practice/Find actions (#33)', () => {
    const root = shadow();
    renderPanel(root, vm);
    const item = root.querySelector('.fp-mistake')!;
    const t = item.textContent ?? '';
    expect(t).toContain('ab12cd34');
    expect(t).toContain('Inferences');
    expect(t).toContain('Hard');
    expect(t).toContain('2026-06-13');
    expect(t).toContain('fell for the trap');
    // Issue #33: both dead links and their wrapper are removed from the mistake item.
    expect(item.querySelector('a.fp-practice-link')).toBeNull();
    expect(item.querySelector('a.fp-find-link')).toBeNull();
    expect(item.querySelector('.fp-mistake-actions')).toBeNull();
  });

  it('escapes the student note (no HTML injection from journal text)', () => {
    const root = shadow();
    renderPanel(root, { stats, mistakes: [{ ...mistakes[0]!, note: '<img src=x onerror=alert(1)>' }] });
    expect(root.querySelector('.fp-mistake img')).toBeNull();     // note rendered as text, not markup
    expect(root.querySelector('.fp-mistake-note')!.textContent).toContain('<img');
  });

  it('shows an empty state when there are no mistakes yet', () => {
    const root = shadow();
    renderPanel(root, { stats: { ...stats, perSkill: [] }, mistakes: [] });
    expect(root.textContent).toContain('No mistakes logged yet');
  });

  it('has a close button that removes the panel', () => {
    const root = shadow();
    renderPanel(root, vm);
    expect(root.querySelector('.fp-panel')).not.toBeNull();
    (root.querySelector('.fp-panel-close') as HTMLElement).click();
    expect(root.querySelector('.fp-panel')).toBeNull();
  });

  it('colours weak-area bars by accuracy tier (worst = low)', () => {
    const root = shadow();
    renderPanel(root, vm);
    const bars = [...root.querySelectorAll('.fp-bar-fill')];
    expect(bars[0]!.classList.contains('fp-bar-low')).toBe(true);    // Inferences 25% → low (red)
    expect(bars[1]!.classList.contains('fp-bar-high')).toBe(true);   // Linear equations 100% → high (green)
  });
});

// Issue #34: a multi-select difficulty control above "Weak areas (worst first)" that re-derives and
// re-renders the weak-area list filtered to the chosen difficulties (empty selection = all). The VM
// gains `difficulties: string[]` (option list) + `selected: Set<string>`, and carries the raw
// `attempts` so the control can re-derive via deriveStats on change.
describe('renderPanel — difficulty filter control (issue #34)', () => {
  function mkAttempt(questionId: string, skill: string, difficulty: string, correct: boolean): Attempt {
    return makeAttempt({ deviceId: 'd', questionId, section: 'Reading', domain: 'Info & Ideas', skill, difficulty, pick: 'B', correct });
  }
  // Inferences: Easy correct, Hard wrong → 50% overall, but 0% on Hard alone.
  // Linear equations: only Easy, correct → 100% overall, absent under a Hard-only filter.
  const attempts: Attempt[] = [
    mkAttempt('q-easy', 'Inferences', 'Easy', true),
    mkAttempt('q-hard', 'Inferences', 'Hard', false),
    mkAttempt('q-lin',  'Linear equations', 'Easy', true),
  ];
  const filterVm: PanelVM = {
    ...vm,
    attempts,
    difficulties: ['Easy', 'Hard'],
    selected: new Set<string>(),    // empty = all
  };

  function changeControl(root: ShadowRoot, difficulty: string): void {
    const input = root.querySelector(`[data-difficulty="${difficulty}"]`) as HTMLInputElement | null;
    expect(input, `expected a difficulty control for "${difficulty}"`).not.toBeNull();
    if (input && 'checked' in input) input.checked = !input.checked;
    input!.dispatchEvent(new Event('change', { bubbles: true }));
  }

  it('renders one option per difficulty, each carrying a data-difficulty hook', () => {
    const root = shadow();
    renderPanel(root, filterVm);
    const opts = [...root.querySelectorAll('[data-difficulty]')];
    expect(opts.map((o) => (o as HTMLElement).dataset.difficulty)).toEqual(['Easy', 'Hard']);
  });

  it('places the difficulty control above the "Weak areas (worst first)" heading', () => {
    const root = shadow();
    renderPanel(root, filterVm);
    const html = (root.querySelector('.fp-panel') as HTMLElement).innerHTML;
    const control = html.indexOf('data-difficulty');
    const heading = html.indexOf('Weak areas (worst first)');
    expect(control).toBeGreaterThanOrEqual(0);
    expect(heading).toBeGreaterThanOrEqual(0);
    expect(control).toBeLessThan(heading);   // control comes first in the markup
  });

  it('re-renders the weak-area list filtered to the selection when a difficulty is toggled', () => {
    const root = shadow();
    renderPanel(root, filterVm);
    // Unfiltered: Inferences (50%) and Linear equations (100%) both shown.
    expect([...root.querySelectorAll('.fp-skill')].map((e) => e.textContent)).toContain('Linear equations');

    changeControl(root, 'Hard');   // select Hard only
    const skills = [...root.querySelectorAll('.fp-skill')].map((e) => e.textContent);
    expect(skills).toContain('Inferences');
    expect(skills).not.toContain('Linear equations');   // Easy-only skill drops out
    // Inferences is now 0/1 on Hard → 0%, not its 50% overall.
    const inf = [...root.querySelectorAll('.fp-weak-area')].find((b) => b.textContent?.includes('Inferences'))!;
    expect(inf.querySelector('.fp-acc')!.textContent).toContain('0%');
  });

  it('shows the weak-area empty-state copy when the filtered list is empty', () => {
    const root = shadow();
    // Only Easy attempts exist; selecting Hard yields an empty weak-area list.
    renderPanel(root, { ...filterVm, attempts: [mkAttempt('q-lin', 'Linear equations', 'Easy', true)] });
    changeControl(root, 'Hard');
    const weak = root.querySelector('.fp-weak-areas')!;
    expect(weak.textContent).toContain('Answer a few questions to see your weak areas.');
  });
});
