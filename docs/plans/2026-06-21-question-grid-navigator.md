# Question-Grid Progress Navigator — Implementation Plan

> **For agentic workers:** use test-driven-development. Failing test first, watch it
> fail for the right reason, then minimal code. Steps use checkbox (`- [ ]`) syntax.
> Run all `npm`/`vitest` commands from `extension/`.

**Goal:** add a bottom-of-page question-grid progress navigator — numbered cells, one
per loaded question, colored green/yellow/red by easy/medium/hard difficulty, marked
with a Correct / Incorrect / For Review state glyph, clicking a cell scrolls that
already-loaded row into view. No new persisted data, no new network, no CB content
read beyond a row's (taxonomy) difficulty.

**Reference:** `docs/specs/2026-06-21-question-grid-navigator-design.md`.

---

## Task 1: Failing tests — list-reader difficulty (lock the cb read)

**Files:** modify `src/cb/list-reader.test.ts`

- [ ] Add a test that `readListQuestionIds(root)` on the existing
  `__fixtures__/results-list.html` returns each row's `difficulty` from
  `.difficulty-column` (Hard / Medium / Easy for the three rows) alongside `id`/`node`.
- [ ] Assert it still returns **only** id + node + difficulty (no stem/choice/passage
  text), and that a row with no `.difficulty-column` yields `''`.
- [ ] Run `npx vitest run src/cb/list-reader.test.ts` — confirm FAIL (field absent),
  not a typo.

## Task 2: Failing tests — nav-grid render + build

**Files:** create `src/ui/nav-grid.test.ts`

- [ ] `buildNavCells(rows, seen)`: done→`correct`, missed→`incorrect`, absent→`review`;
  1-based `n` in row order; `difficulty` carried through.
- [ ] `renderNavGrid(host, cells, { onJump })` into a plain `<div>`:
  one numbered cell per entry, in order (cell number = `textContent`).
- [ ] difficulty→color: easy=green, medium=yellow, hard=red; unknown/empty = neutral
  (assert the three map to distinct non-neutral colors and that color tracks
  difficulty, not state — a correct-easy and incorrect-easy cell share the fill).
- [ ] state→`data-state` + glyph + accessible label (`aria-label`/`title`) for
  correct / incorrect / review.
- [ ] a legend renders both the state key (Correct / Incorrect / For Review) and the
  difficulty color key (Easy / Medium / Hard).
- [ ] idempotent: a second `renderNavGrid` replaces, never duplicates (one grid, N
  cells, not 2N).
- [ ] clicking a cell calls `onJump` with that cell's id; assert the renderer makes no
  `fetch`/network call and adds no auto-advance/enumeration.
- [ ] no CB content: every cell's `textContent` matches `/^\d+ ?[✓✗·]?$/`-style safe
  pattern (digits + fixed glyph) — never arbitrary text.
- [ ] Run `npx vitest run src/ui/nav-grid.test.ts` — confirm FAIL (module/fns absent).

## Task 3: Implement the cb read

**Files:** modify `src/cb/list-reader.ts`

- [ ] Extend `ListRow` with `difficulty: string`. In `readListQuestionIds`, read
  `node.querySelector('.difficulty-column')?.textContent?.trim() ?? ''` per row. Keep
  the existing id regex + node. No content read. Keep `readListQuestionIds`'s shape
  otherwise stable (callers ignore the new field).
- [ ] Run `npx vitest run src/cb/list-reader.test.ts` — PASS.

## Task 4: Implement nav-grid

**Files:** create `src/ui/nav-grid.ts`

- [ ] `NavCell` type + `buildNavCells(rows, seen)` pure builder per the spec.
- [ ] `renderNavGrid(host, cells, { onJump })`: idempotent (remove prior grid first),
  build a fixed bottom strip with `createElement`/`textContent` only; per-cell inline
  background by difficulty (easy/green, medium/yellow, hard/red, other/gray) +
  `data-difficulty`; per-cell `data-state` + glyph + `aria-label` by state; a legend
  row; click → `onJump(cell.id)`. Match `badger.ts` idioms (inline pill styling,
  fixed class name constant, `data-*` hooks). No innerHTML of CB-derived strings.
- [ ] Run `npx vitest run src/ui/nav-grid.test.ts` — PASS.

## Task 5: Wire the mount + full green

**Files:** modify `src/entrypoints/content.ts`

- [ ] Where `refreshBadges` / `watchResultsList` paint chips, also build cells from
  `readListQuestionIds(list)` + `getSeen(db)` and `renderNavGrid` into the
  `mountHost(doc)` shadow root with `onJump: (id) => scrollToResume(list, id)`. Repaint
  on the same triggers as the badger (list (re)render + after `recordAttempt`). No new
  network; keep everything inside `guardedStart`.
- [ ] Run `npx vitest run && npx tsc --noEmit && npm run build` — all green, `tsc`
  exits 0, chrome bundle builds. (Optional: `:firefox` / `:edge`.)
- [ ] Visual check (UI diff): note in the PR that a reviewer should run
  `/verify-overlay` on a real CB question. In headless CI there is no dev Chrome —
  record "visual check pending human review."
