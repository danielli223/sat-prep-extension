// Issue #25 — question-grid progress navigator. A pure view-model builder (buildNavCells) plus an
// idempotent renderer (renderNavGrid), modelled on badger.ts. Two ORTHOGONAL encodings (design
// 2026-06-21): the cell BACKGROUND encodes DIFFICULTY only (green/yellow/red for easy/medium/hard,
// neutral otherwise — honoring the issue's "only green/yellow/red for easy/medium/hard"), while
// answer STATE is shown by a glyph + data-state + an accessible label. So a correct-Easy and an
// incorrect-Easy cell share the same green fill and differ only by glyph/data-state.
//
// NO CB content ever reaches a cell: each cell's text is a number + one fixed state glyph; built with
// createElement/textContent only (no innerHTML of any CB-derived string). Navigation is delegated to
// the caller via onJump — the renderer itself performs no DOM lookup beyond its own cells and NO network.

export const NAV_GRID_CLASS = 'fp-nav-grid';
export const NAV_CELL_CLASS = 'fp-nav-cell';

export interface NavCell {
  id: string;
  n: number;
  state: 'correct' | 'incorrect' | 'review';
  difficulty: string;
}

// Fixed state glyphs (part of the contract): correct/incorrect/review. Nothing else can appear in a cell.
const GLYPH: Record<NavCell['state'], string> = { correct: '✓', incorrect: '✗', review: '·' };
const STATE_WORD: Record<NavCell['state'], string> = {
  correct: 'Correct', incorrect: 'Incorrect', review: 'Review',
};

// Difficulty tier → normalized bucket. Case-insensitive; anything empty/unrecognized → 'other'.
type Tier = 'easy' | 'medium' | 'hard' | 'other';
function normalizeDifficulty(difficulty: string): Tier {
  const d = difficulty.trim().toLowerCase();
  if (d === 'easy') return 'easy';
  if (d === 'medium') return 'medium';
  if (d === 'hard') return 'hard';
  return 'other';
}

// Background keyed off DIFFICULTY only (not state) — the load-bearing rule. The four fills are mutually
// distinct strings, so the three difficulty colors never lie and two same-difficulty cells always match.
const DIFFICULTY_BG: Record<Tier, string> = {
  easy: '#dcfce7',    // green
  medium: '#fef9c3',  // yellow
  hard: '#fee2e2',    // red
  other: '#f1f5f9',   // neutral / gray
};

/** Pure builder: maps the ordered loaded rows + the student's own seen map to renderable cells. */
export function buildNavCells(
  rows: { id: string; difficulty: string }[],
  seen: Record<string, 'done' | 'missed'>,
): NavCell[] {
  return rows.map((row, i) => ({
    id: row.id,
    n: i + 1,                                   // 1-based, in row order
    state: seen[row.id] === 'done' ? 'correct'
      : seen[row.id] === 'missed' ? 'incorrect'
      : 'review',
    difficulty: row.difficulty,                 // carried straight through
  }));
}

// Inline cell styling (this grid mounts in our shadow root, but we keep the per-cell fill inline so the
// difficulty color travels with the cell, mirroring badger.ts's inline-pill approach).
const CELL_STYLE = 'display:inline-flex;align-items:center;justify-content:center;gap:3px;min-width:30px;' +
  'padding:3px 6px;border-radius:7px;cursor:pointer;border:1px solid rgba(0,0,0,.12);' +
  'font:700 12px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1f2937;';

/** Idempotent renderer: removes any prior grid in `host`, then renders one cell per NavCell. */
export function renderNavGrid(
  host: Element | ShadowRoot,
  cells: NavCell[],
  handlers: { onJump: (id: string) => void },
): void {
  // Idempotent: drop a prior grid before re-rendering (one grid, N cells — never duplicated).
  host.querySelector(`.${NAV_GRID_CLASS}`)?.remove();
  const doc = (host instanceof ShadowRoot ? host.host : host).ownerDocument ?? document;

  const grid = doc.createElement('div');
  grid.className = NAV_GRID_CLASS;
  // Fixed bottom strip inside the overlay host's shadow root. The host is pointer-events:none and
  // click-through (host.ts mountHost), and a statically-positioned div would neither sit at the
  // bottom nor be clickable — so we pin it (position:fixed;bottom:0;left:0;right:0) and re-enable
  // pointer-events:auto here. z-index:2 keeps it above the dimmed card backdrop (.fp-card-slot is
  // z-index:1) but below the extras slot (z-index:3) so it never buries the calculator/journal.
  // max-height + overflow:auto so a long grid scrolls instead of covering the page. Cells keep the
  // existing flex/wrap/gap.
  grid.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2;pointer-events:auto;' +
    'box-sizing:border-box;max-height:40vh;overflow:auto;background:#fff;border-top:1px solid #e5e7eb;' +
    'box-shadow:0 -8px 24px rgba(0,0,0,.18);display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:8px;';

  for (const cell of cells) {
    const tier = normalizeDifficulty(cell.difficulty);
    const el = doc.createElement('button');
    el.type = 'button';
    el.className = NAV_CELL_CLASS;
    el.setAttribute('data-state', cell.state);
    el.setAttribute('data-difficulty', tier);
    el.style.cssText = CELL_STYLE;
    el.style.background = DIFFICULTY_BG[tier];   // fill keyed off DIFFICULTY only
    el.setAttribute('aria-label', `Question ${cell.n}: ${STATE_WORD[cell.state]}`);
    el.title = `Question ${cell.n}: ${STATE_WORD[cell.state]}`;
    // textContent ONLY — a number + one fixed state glyph; no CB content can leak in.
    el.textContent = `${cell.n} ${GLYPH[cell.state]}`;
    el.addEventListener('click', () => handlers.onJump(cell.id));   // navigation delegated; no network here
    grid.appendChild(el);
  }

  grid.appendChild(buildLegend(doc));
  host.appendChild(grid);
}

// Legend renders BOTH keys: the state key (Correct/Incorrect/Review) and the difficulty color key
// (Easy/Medium/Hard). Fixed words only — never CB content.
function buildLegend(doc: Document): HTMLElement {
  const legend = doc.createElement('div');
  legend.className = 'fp-nav-legend';
  legend.style.cssText = 'flex-basis:100%;display:flex;flex-wrap:wrap;gap:10px;margin-top:4px;' +
    'font:500 11px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#6b7280;';

  const stateKey = doc.createElement('span');
  stateKey.textContent = `${GLYPH.correct} Correct  ${GLYPH.incorrect} Incorrect  ${GLYPH.review} Review`;
  const diffKey = doc.createElement('span');
  diffKey.textContent = 'Easy  Medium  Hard';

  legend.append(stateKey, diffKey);
  return legend;
}
