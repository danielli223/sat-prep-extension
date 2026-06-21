import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  buildNavCells,
  renderNavGrid,
  NAV_GRID_CLASS,
  NAV_CELL_CLASS,
  type NavCell,
} from './nav-grid';

// Issue #25: a question-grid progress navigator. A pure view-model builder (buildNavCells) plus an
// idempotent renderer (renderNavGrid), modelled on badger.ts. Background color encodes DIFFICULTY ONLY
// (green/yellow/red for easy/medium/hard, neutral otherwise); answer STATE is shown by a glyph +
// data-state + accessible label. Cells carry only a number + a fixed glyph — never any CB content.
//
// Glyphs are part of the contract the maker must implement against:
const GLYPH = { correct: '✓', incorrect: '✗', review: '·' } as const;
// Every cell's text is digits + an optional fixed state glyph only — nothing else can appear.
const SAFE_CELL_TEXT = /^\s*\d+\s*[✓✗·]?\s*$/;

function mount(): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  return host;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('buildNavCells', () => {
  it('maps seen done→correct, missed→incorrect, absent→review', () => {
    const rows = [
      { id: 'ab12cd34', difficulty: 'Hard' },
      { id: 'ef56ab78', difficulty: 'Medium' },
      { id: '99ff00aa', difficulty: 'Easy' },
    ];
    const cells = buildNavCells(rows, { ab12cd34: 'done', ef56ab78: 'missed' }); // 99ff00aa absent
    expect(cells.map((c) => c.state)).toEqual(['correct', 'incorrect', 'review']);
  });

  it('numbers cells 1-based in input row order and carries difficulty straight through', () => {
    const rows = [
      { id: 'ab12cd34', difficulty: 'Hard' },
      { id: 'ef56ab78', difficulty: 'Medium' },
      { id: '99ff00aa', difficulty: 'Easy' },
    ];
    const cells = buildNavCells(rows, {});
    expect(cells.map((c) => c.n)).toEqual([1, 2, 3]);
    expect(cells.map((c) => c.id)).toEqual(['ab12cd34', 'ef56ab78', '99ff00aa']);
    expect(cells.map((c) => c.difficulty)).toEqual(['Hard', 'Medium', 'Easy']);
  });
});

describe('renderNavGrid', () => {
  const ROWS = [
    { id: 'ab12cd34', difficulty: 'Hard' },
    { id: 'ef56ab78', difficulty: 'Medium' },
    { id: '99ff00aa', difficulty: 'Easy' },
  ];
  const noop = { onJump: () => {} };

  function cellsOf(host: Element): HTMLElement[] {
    const grid = host.querySelector(`.${NAV_GRID_CLASS}`)!;
    return [...grid.querySelectorAll(`.${NAV_CELL_CLASS}`)] as HTMLElement[];
  }

  it('renders one cell per NavCell, in order, each showing its 1-based number', () => {
    const host = mount();
    renderNavGrid(host, buildNavCells(ROWS, {}), noop);
    const cells = cellsOf(host);
    expect(cells).toHaveLength(3);
    expect(cells[0]!.textContent).toContain('1');
    expect(cells[1]!.textContent).toContain('2');
    expect(cells[2]!.textContent).toContain('3');
  });

  it('colors the cell background by difficulty (easy/medium/hard distinct, non-empty) via data-difficulty + inline background', () => {
    const host = mount();
    renderNavGrid(host, buildNavCells(ROWS, {}), noop);
    const [hard, medium, easy] = cellsOf(host) as [HTMLElement, HTMLElement, HTMLElement];

    expect(hard.getAttribute('data-difficulty')).toBe('hard');
    expect(medium.getAttribute('data-difficulty')).toBe('medium');
    expect(easy.getAttribute('data-difficulty')).toBe('easy');

    expect(easy.style.background).not.toBe('');
    expect(medium.style.background).not.toBe('');
    expect(hard.style.background).not.toBe('');

    // The three difficulty colors must be visibly distinct (green vs yellow vs red).
    const bgs = new Set([easy.style.background, medium.style.background, hard.style.background]);
    expect(bgs.size).toBe(3);
  });

  it('gives an unknown/empty difficulty a neutral fill distinct from easy/medium/hard', () => {
    const host = mount();
    const rows = [...ROWS, { id: '0000beef', difficulty: '' }];
    renderNavGrid(host, buildNavCells(rows, {}), noop);
    const cells = cellsOf(host);
    const [hard, medium, easy, other] = cells as [HTMLElement, HTMLElement, HTMLElement, HTMLElement];

    // Normalized to a non-difficulty bucket — NOT one of easy/medium/hard, so the 3 colors never lie.
    expect(other.getAttribute('data-difficulty')).toMatch(/^(other|unknown)$/);
    expect(other.style.background).not.toBe('');
    expect(other.style.background).not.toBe(easy.style.background);
    expect(other.style.background).not.toBe(medium.style.background);
    expect(other.style.background).not.toBe(hard.style.background);
  });

  it('COLOR TRACKS DIFFICULTY, NOT STATE: same-difficulty cells share a background regardless of state', () => {
    const host = mount();
    const rows = [
      { id: 'aaaa0001', difficulty: 'Easy' },   // will be correct
      { id: 'aaaa0002', difficulty: 'Easy' },   // will be incorrect
    ];
    renderNavGrid(host, buildNavCells(rows, { aaaa0001: 'done', aaaa0002: 'missed' }), noop);
    const [correctEasy, incorrectEasy] = cellsOf(host) as [HTMLElement, HTMLElement];

    // Different answer state...
    expect(correctEasy.getAttribute('data-state')).toBe('correct');
    expect(incorrectEasy.getAttribute('data-state')).toBe('incorrect');
    // ...but identical fill, because the fill is keyed off difficulty only (the load-bearing rule).
    expect(correctEasy.style.background).toBe(incorrectEasy.style.background);
  });

  it('encodes state via data-state + a glyph + an accessible label (correct/incorrect/review)', () => {
    const host = mount();
    const rows = [
      { id: 'aaaa0001', difficulty: 'Easy' },
      { id: 'aaaa0002', difficulty: 'Medium' },
      { id: 'aaaa0003', difficulty: 'Hard' },
    ];
    renderNavGrid(host, buildNavCells(rows, { aaaa0001: 'done', aaaa0002: 'missed' }), noop); // 3rd → review
    const [correct, incorrect, review] = cellsOf(host) as [HTMLElement, HTMLElement, HTMLElement];

    expect(correct.getAttribute('data-state')).toBe('correct');
    expect(incorrect.getAttribute('data-state')).toBe('incorrect');
    expect(review.getAttribute('data-state')).toBe('review');

    expect(correct.textContent).toContain(GLYPH.correct);
    expect(incorrect.textContent).toContain(GLYPH.incorrect);
    expect(review.textContent).toContain(GLYPH.review);

    const label = (el: HTMLElement) => el.getAttribute('aria-label') ?? el.getAttribute('title') ?? '';
    expect(label(correct)).toMatch(/Correct/i);
    expect(label(incorrect)).toMatch(/Incorrect/i);
    expect(label(review)).toMatch(/Review/i);
  });

  it('renders a legend inside the grid showing BOTH the state key and the difficulty color key', () => {
    const host = mount();
    renderNavGrid(host, buildNavCells(ROWS, {}), noop);
    const grid = host.querySelector(`.${NAV_GRID_CLASS}`) as HTMLElement;
    const text = grid.textContent ?? '';
    // State key:
    expect(text).toMatch(/Correct/);
    expect(text).toMatch(/Incorrect/);
    expect(text).toMatch(/Review/);
    // Difficulty color key:
    expect(text).toMatch(/Easy/);
    expect(text).toMatch(/Medium/);
    expect(text).toMatch(/Hard/);
  });

  it('is idempotent: re-rendering replaces, never duplicates (one grid, N cells, not 2N)', () => {
    const host = mount();
    renderNavGrid(host, buildNavCells(ROWS, {}), noop);
    renderNavGrid(host, buildNavCells(ROWS, { ab12cd34: 'done' }), noop);
    expect(host.querySelectorAll(`.${NAV_GRID_CLASS}`)).toHaveLength(1);
    expect(host.querySelectorAll(`.${NAV_CELL_CLASS}`)).toHaveLength(3);
  });

  it('clicking a cell calls onJump exactly once with THAT cell\'s id', () => {
    const host = mount();
    const onJump = vi.fn();
    renderNavGrid(host, buildNavCells(ROWS, {}), { onJump });
    cellsOf(host)[1]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onJump).toHaveBeenCalledTimes(1);
    expect(onJump).toHaveBeenCalledWith('ef56ab78');   // the second cell's id
  });

  it('performs NO network: render + a cell click never call fetch (invariant #4 — navigation is delegated)', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const host = mount();
    renderNavGrid(host, buildNavCells(ROWS, {}), { onJump: () => {} });
    cellsOf(host)[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('NO CB CONTENT: every cell\'s text is digits + a fixed state glyph only', () => {
    const host = mount();
    renderNavGrid(host, buildNavCells(ROWS, { ab12cd34: 'done', ef56ab78: 'missed' }), noop);
    for (const cell of cellsOf(host)) {
      expect(cell.textContent ?? '').toMatch(SAFE_CELL_TEXT);
    }
  });
});

// Type-level contract: NavCell carries exactly id/n/state/difficulty. (Kept as a compile-time check;
// the import above fails first while nav-grid.ts is absent, which is the intended failing state.)
const _cellShape: NavCell = { id: 'x', n: 1, state: 'review', difficulty: '' };
void _cellShape;
