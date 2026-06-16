import { describe, it, expect } from 'vitest';
import { renderPanel, type PanelVM, CB_SEARCH_URL } from './panel';
import type { Stats } from '../stats';
import type { Mistake } from '../journal';

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

  it('renders weak-area bars worst-first, each with a Practice-on-CB coachmark link carrying a data-skill hook', () => {
    const root = shadow();
    renderPanel(root, vm);
    const bars = [...root.querySelectorAll('.fp-weak-area')];
    expect(bars[0]!.textContent).toContain('Inferences');         // 25% worst → first
    const link = bars[0]!.querySelector('a.fp-practice-link') as HTMLAnchorElement;
    expect(link.href).toBe(CB_SEARCH_URL);                        // plain link to CB QB (student drives — D3)
    expect(link.target).toBe('_blank');
    expect(link.dataset.skill).toBe('Inferences');                // hook the integration layer wires the coachmark to
    expect(link.textContent).toContain('Practice Inferences on CB');
  });

  it('renders the mistakes list with note + id/skill/difficulty/date + Practice/Find links', () => {
    const root = shadow();
    renderPanel(root, vm);
    const item = root.querySelector('.fp-mistake')!;
    const t = item.textContent ?? '';
    expect(t).toContain('ab12cd34');
    expect(t).toContain('Inferences');
    expect(t).toContain('Hard');
    expect(t).toContain('2026-06-13');
    expect(t).toContain('fell for the trap');
    expect(item.querySelector('a.fp-practice-link')).not.toBeNull();
    expect(item.querySelector('a.fp-find-link')).not.toBeNull();
  });

  it('renders the mistake Practice/Find links with a data-skill hook for the coachmark hand-off', () => {
    const root = shadow();
    renderPanel(root, vm);
    const item = root.querySelector('.fp-mistake')!;
    expect((item.querySelector('a.fp-practice-link') as HTMLAnchorElement).dataset.skill).toBe('Inferences');
    expect((item.querySelector('a.fp-find-link') as HTMLAnchorElement).dataset.skill).toBe('Inferences');
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
