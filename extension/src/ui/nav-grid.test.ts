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

// Issue #76: the navigator must be COLLAPSED BY DEFAULT behind a toggle ("Questions · N") that the
// student clicks to reveal the full grid of cells + legend and clicks again to hide them — it no longer
// permanently covers the page. When expanded it shows a cell for EVERY loaded question (no implicit cap).
// The toggle carries aria-expanded + aria-controls; the expandable region is what those reference.
describe('renderNavGrid — collapsible "show all" (issue #76)', () => {
  const ROWS = [
    { id: 'ab12cd34', difficulty: 'Hard' },
    { id: 'ef56ab78', difficulty: 'Medium' },
    { id: '99ff00aa', difficulty: 'Easy' },
  ];
  const noop = { onJump: () => {} };

  // The toggle is the only control visible while collapsed: a button that carries aria-expanded and
  // aria-controls (so it is unambiguously the disclosure control, not a cell).
  function toggleOf(host: Element): HTMLElement {
    const grid = host.querySelector(`.${NAV_GRID_CLASS}`)!;
    const btn = grid.querySelector('[aria-expanded][aria-controls]') as HTMLElement | null;
    expect(btn, 'expected a toggle control with aria-expanded + aria-controls').not.toBeNull();
    return btn!;
  }

  // The expandable region holding the cells + legend — referenced by the toggle's aria-controls.
  function regionOf(host: Element): HTMLElement {
    const toggle = toggleOf(host);
    const id = toggle.getAttribute('aria-controls')!;
    const region = host.querySelector(`#${CSS.escape(id)}`) as HTMLElement | null;
    expect(region, `aria-controls "${id}" must reference an existing region`).not.toBeNull();
    return region!;
  }

  // "Hidden" is satisfied either by display:none on the cells/legend region OR a data-collapsed flag.
  // We require AT LEAST ONE of those collapse signals so a no-op (always-open) renderer fails, while a
  // real collapse implementation — whichever mechanism it chooses — passes.
  function isCollapsed(host: Element): boolean {
    const toggle = toggleOf(host);
    if (toggle.getAttribute('aria-expanded') === 'true') return false;
    const grid = host.querySelector(`.${NAV_GRID_CLASS}`) as HTMLElement;
    const region = regionOf(host);
    const flagged = grid.hasAttribute('data-collapsed') || region.hasAttribute('data-collapsed')
      || grid.getAttribute('data-expanded') === 'false' || region.getAttribute('data-expanded') === 'false';
    const hidden = region.style.display === 'none' || region.hidden;
    return flagged || hidden;
  }

  it('is COLLAPSED BY DEFAULT: a toggle shows the count while the cells + legend region is hidden', () => {
    const host = mount();
    renderNavGrid(host, buildNavCells(ROWS, {}), noop);

    const toggle = toggleOf(host);
    // The toggle advertises the closed state and the count of loaded questions.
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.textContent ?? '').toMatch(/3/);          // N === number of cells
    expect(toggle.textContent ?? '').toMatch(/Question/i);  // a generic "Questions" label (no SAT/CB branding)

    // The cells + legend are NOT visible until the student expands.
    expect(isCollapsed(host)).toBe(true);
  });

  it('EXPANDS on toggle click: reveals the cells + legend and flips aria-expanded to "true"', () => {
    const host = mount();
    renderNavGrid(host, buildNavCells(ROWS, {}), noop);

    toggleOf(host).dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const toggle = toggleOf(host);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(isCollapsed(host)).toBe(false);

    // The full encoding is present once expanded: a cell per row + the legend's both keys.
    const grid = host.querySelector(`.${NAV_GRID_CLASS}`) as HTMLElement;
    expect(grid.querySelectorAll(`.${NAV_CELL_CLASS}`)).toHaveLength(3);
    expect(grid.textContent ?? '').toMatch(/Correct/);
    expect(grid.textContent ?? '').toMatch(/Easy/);
  });

  it('COLLAPSES again on a second toggle click: re-hides the region and flips aria-expanded back to "false"', () => {
    const host = mount();
    renderNavGrid(host, buildNavCells(ROWS, {}), noop);

    const toggle = toggleOf(host);
    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true })); // expand
    expect(toggleOf(host).getAttribute('aria-expanded')).toBe('true');

    toggleOf(host).dispatchEvent(new MouseEvent('click', { bubbles: true })); // collapse again
    expect(toggleOf(host).getAttribute('aria-expanded')).toBe('false');
    expect(isCollapsed(host)).toBe(true);
  });

  it('SHOWS ALL (no implicit cap): a >10-cell input renders one cell per entry when expanded', () => {
    const host = mount();
    // 13 synthetic rows — bare 8-hex ids, rotating difficulties. More than CB's ~10-row window.
    const many = Array.from({ length: 13 }, (_, i) => ({
      id: `dead${i.toString(16).padStart(4, '0')}`,
      difficulty: ['Easy', 'Medium', 'Hard'][i % 3]!,
    }));
    renderNavGrid(host, buildNavCells(many, {}), noop);

    toggleOf(host).dispatchEvent(new MouseEvent('click', { bubbles: true })); // expand to reveal all

    const grid = host.querySelector(`.${NAV_GRID_CLASS}`) as HTMLElement;
    const cells = [...grid.querySelectorAll(`.${NAV_CELL_CLASS}`)];
    expect(cells).toHaveLength(many.length);          // every entry, no cap
    expect(cells[12]!.textContent ?? '').toMatch(/13/); // the 13th cell really is rendered
    // The toggle's count reflects the full set, not a capped subset.
    expect(toggleOf(host).textContent ?? '').toMatch(/13/);
  });

  it('ACCESSIBILITY: the toggle exposes aria-expanded and aria-controls referencing the expandable region', () => {
    const host = mount();
    renderNavGrid(host, buildNavCells(ROWS, {}), noop);

    const toggle = toggleOf(host);
    expect(toggle.hasAttribute('aria-expanded')).toBe(true);

    const controls = toggle.getAttribute('aria-controls');
    expect(controls, 'toggle must carry aria-controls').toBeTruthy();

    // The id it points at must exist in the rendered DOM and be the region that holds the cells.
    const region = host.querySelector(`#${CSS.escape(controls!)}`);
    expect(region, 'aria-controls must reference a real element id').not.toBeNull();
    expect(region!.querySelector(`.${NAV_CELL_CLASS}`), 'controlled region holds the cells').not.toBeNull();
  });
});

// Type-level contract: NavCell carries exactly id/n/state/difficulty. (Kept as a compile-time check;
// the import above fails first while nav-grid.ts is absent, which is the intended failing state.)
const _cellShape: NavCell = { id: 'x', n: 1, state: 'review', difficulty: '' };
void _cellShape;
