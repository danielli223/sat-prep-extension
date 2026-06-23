# Nav-Grid Collapsible "Show All" + Cell-Click-Opens-Question — Implementation Plan

> **For agentic workers:** use test-driven-development. Failing test first, watch it
> fail for the right reason, then minimal code. Steps use checkbox (`- [ ]`) syntax.
> Run all `npm`/`vitest` commands from `extension/`.

**Goal:** make the bottom question-grid navigator (Issue #25) **collapsed by default**
behind a toggle that expands the full grid of **all currently-loaded** questions and
collapses back out of the way, and change **cell-click to open that question** (click
CB's own already-rendered row button) instead of merely scrolling the list. No new
persisted data, no new network, no CB content read, no enumeration/prefetch.

**Reference:** `docs/specs/2026-06-22-nav-grid-collapsible-show-all-design.md`.

---

## Task 1: Failing tests — collapsible navigator (nav-grid)

**Files:** modify `src/ui/nav-grid.test.ts`

- [ ] **Collapsed by default:** after `renderNavGrid(host, cells, handlers)`, the cells
  + legend region is hidden (assert via the chosen mechanism, e.g. the region is not
  displayed / a `data-collapsed` flag is set) while a toggle control exists and shows
  the cell count.
- [ ] **Expand on toggle click:** dispatching a click on the toggle reveals the cells +
  legend and flips `aria-expanded` to `"true"`; assert the difficulty backgrounds /
  glyphs / legend / per-cell `aria-label`s are present when expanded.
- [ ] **Collapse again:** a second toggle click (or close control) re-hides them and
  flips `aria-expanded` back to `"false"`.
- [ ] **Show all loaded (no cap):** with a >10-cell input, expanding shows a cell for
  every entry (rendered cell count === input length).
- [ ] **Accessibility:** the toggle exposes `aria-expanded` and `aria-controls`
  referencing the expandable region's id.
- [ ] Keep every existing nav-grid assertion (order, color-by-difficulty,
  `data-state`+glyph+label, legend both keys, idempotent re-render, `onJump` with the
  right id, no `fetch`, safe cell text). Do not weaken them.
- [ ] Run `npx vitest run src/ui/nav-grid.test.ts` — confirm the NEW tests FAIL for the
  right reason (no toggle / not collapsed yet), not a typo/import error.

## Task 2: Failing tests — open-the-question helper (resume)

**Files:** modify `src/ui/resume.test.ts`

- [ ] `openListQuestion(listRoot, id)` **clicks that row's `.id-column` button** — mount
  the synthetic `__fixtures__/results-list.html`, attach a click spy to the matching
  row's `button`, call the helper, assert the spy fired exactly once.
- [ ] It targets the **matching id only** — clicking for one id must not click another
  row's button.
- [ ] **Fallback:** for a row with no clickable button, it falls back to
  `scrollIntoView` (does not throw); an unknown id returns `null` and clicks nothing.
- [ ] **No network:** stub `fetch`; assert the helper never calls it.
- [ ] Run `npx vitest run src/ui/resume.test.ts` — confirm FAIL (helper absent).

## Task 3: Implement the open-the-question helper

**Files:** modify `src/ui/resume.ts`

- [ ] Add `openListQuestion(listRoot, id)`: look up the row via
  `readListQuestionIds(listRoot)` (reusing the same lookup `scrollToResume` uses), find
  `row.node.querySelector('.id-column button')`, and `.click()` it to open the
  question; if no button, fall back to `scrollToResume(listRoot, id)`; unknown id →
  `null`. This is the only new CB-shape knowledge (a click target, never a content
  read); keep it here beside the existing list-reader usage, out of `nav-grid.ts`.
- [ ] Run `npx vitest run src/ui/resume.test.ts` — PASS.

## Task 4: Implement the collapsible navigator

**Files:** modify `src/ui/nav-grid.ts`

- [ ] In `renderNavGrid`, wrap the cells + legend in a collapsible region and add a
  toggle control ("Questions · N") that is the only thing visible by default. Track
  open/closed with a `data-collapsed` attribute (or equivalent) toggled in place; set
  `aria-expanded` on the toggle and `aria-controls` to the region's id; provide a way
  to collapse again (the toggle and/or a close control). When collapsed the control
  occupies only the toggle's footprint so it no longer covers the page.
- [ ] Keep the renderer pure/idempotent and CB-content-free: cells still built with
  `createElement`/`textContent` (`number + fixed glyph`), background by difficulty,
  `data-state`+glyph+`aria-label` by state, legend unchanged, click → `onJump(cell.id)`,
  no DOM lookup beyond its own cells, no network. `buildNavCells` unchanged.
- [ ] Run `npx vitest run src/ui/nav-grid.test.ts` — PASS (new + existing).

## Task 5: Wire cell-click to open + full green

**Files:** modify `src/entrypoints/content.ts`

- [ ] In `refreshBadges`, change the nav-grid handler from
  `onJump: (id) => scrollToResume(listRoot, id)` to
  `onJump: (id) => openListQuestion(listRoot, id)` (import the new helper). Leave the
  single `getSeen` read, the `mountHost` shadow-root mount, and the repaint triggers
  unchanged. No new network; stays inside `guardedStart`.
- [ ] Run `npx vitest run && npx tsc --noEmit && npm run build` — all green, `tsc`
  exits 0, the chrome bundle builds. (Optional: `:firefox` / `:edge`.)
- [ ] Visual check (UI diff in `src/ui/`): note in the PR that a reviewer should run
  `/verify-overlay` on a real CB question (collapse/expand toggling + cell-click
  actually entering the question). In headless CI there is no dev Chrome and no human —
  record "visual check pending human review."
