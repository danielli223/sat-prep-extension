# Question-Grid Progress Navigator — Design

*Date: 2026-06-21 · Issue #25 · Status: approved (triage: BUILDABLE; invariants #2 & #4 in scope but already satisfied by existing patterns)*

## Problem

Issue #25 (area: Reading) asks for a **question-grid progress navigator at the
bottom of the page**, modelled on College Board's own "Question Bank" grid: a strip
of numbered cells, one per question, with a Correct / Incorrect / For Review legend.
It additionally asks for a **color code using only green / yellow / red — for
easy / medium / hard difficulty**.

Today the student gets per-row done/missed/new chips (`badger.ts`) on the results
list and guided resume (`resume.ts`), but no compact, always-visible map of the
whole loaded set with at-a-glance difficulty + progress.

## Two color axes — how the conflict is resolved

The issue conflates two encodings: CB's grid uses color/icons for
*Correct / Incorrect / For Review* **state**, while the issue then asks green /
yellow / red to mean *easy / medium / hard* **difficulty**. These are orthogonal.
Resolution (a product decision, not a bright-line one):

- **Background color encodes difficulty only** — green = Easy, yellow = Medium,
  red = Hard — honoring the issue's explicit "only use green / yellow / red — for
  easy / medium / hard." An unknown/empty difficulty gets a neutral (gray) fill, so
  the three difficulty colors never lie.
- **Answer state is shown by a glyph + accessible label**, not by the fill color:
  `✓` correct, `✗` incorrect, `·` for-review (not yet answered this session). Each
  cell carries `data-state` and an `aria-label`/`title`, mirroring the badger's
  `data-state` pattern. So a correct-Easy and an incorrect-Easy cell are both green
  and differ only by glyph/`data-state`.
- A **legend** renders both keys: the state legend (Correct / Incorrect / For Review)
  and the difficulty color key (Easy / Medium / Hard).

"For Review" maps to *not yet answered this session* — the closest signal we have
without inventing a new persisted "flagged for review" field (that would touch the
store guard and is out of scope; noted as a possible follow-up).

## Why no bright line is touched

- **#1 Read rendered DOM only / no CB endpoint.** No fetch/XHR/WebSocket anywhere.
  The cell list is built from the *already-rendered* results rows
  (`readListQuestionIds`) plus the student's own persisted progress. No
  `qbank-api`/`collegeboard.org` call; no new host permission.
- **#2 Persist only IDs + the student's own data.** The navigator **persists
  nothing new.** State comes from `getSeen` (already-derived from the student's own
  `Attempt` log). Difficulty is *read live* from the rendered results row's
  `.difficulty-column` (taxonomy metadata — the same class of non-content field
  `reader.ts` already reads, and an allow-listed stored field in `guard.ts`) and
  *rendered*, never written. `guard.ts` and the store schema are untouched. No CB
  question stem / choice / passage / rationale is read, rendered, or stored — cells
  carry only a number, a fixed state glyph/label, and a difficulty tier label.
- **#3 No AI.** None.
- **#4 Every transition user-initiated; no prefetch / enumeration / auto-advance.**
  The grid only shows rows **already loaded** in the current DOM (it never
  enumerates IDs or fetches more). Clicking a cell **scrolls that already-loaded row
  into view** (reusing `resume.ts`'s `scrollToResume` posture) — it does not fetch,
  prefetch, advance to, or open the next question. Rendering is triggered only by
  CB's own list (re)render and by the student recording an attempt — never on a timer
  or by look-ahead.
- **#5 Trademark.** No "SAT" / "College Board" / acorn in the navigator. Its label is
  generic ("Progress"); the legend uses plain words (Correct / Incorrect / For Review,
  Easy / Medium / Hard).
- **#6 Fail safe.** It mounts inside the existing boot path, which already runs behind
  `guardedStart` (kill-switch + block detection). No new always-on network.

The fragile `src/cb/` layer gains exactly one small, taxonomy-only read (the row's
difficulty), covered by a synthetic fixture + test — see below.

## Components

### `src/cb/list-reader.ts` (fragile layer — minimal extension)

`readListQuestionIds` currently returns `{ id, node }` per row. Extend `ListRow`
with an optional `difficulty: string` read from the row's `.difficulty-column`
(taxonomy, never content; empty string if the cell is absent). Existing callers
(`badger.ts`, `resume.ts`, `content.ts`) ignore the new field and are unaffected.
The synthetic fixture `__fixtures__/results-list.html` already carries
`.difficulty-column` values (Hard / Medium / Easy), so the new assertion needs no
fixture change. **No content is read** — still only id + node + the difficulty tier.

### `src/ui/nav-grid.ts` (new — our interaction layer)

A pure, idempotent renderer plus a small view-model builder, modelled on
`badger.ts`:

- `buildNavCells(rows, seen): NavCell[]` — pure function. `rows` is the ordered
  loaded list (`{ id, difficulty }[]`), `seen` is the `getSeen` map. Produces, in row
  order, `{ id, n (1-based), state, difficulty }` where
  `state = seen[id]==='done' ? 'correct' : seen[id]==='missed' ? 'incorrect' : 'review'`.
- `renderNavGrid(host, cells, { onJump }): void` — renders a fixed bottom strip into
  `host` (an `Element` / `ShadowRoot`; tests pass a plain `<div>`). One numbered cell
  per entry (`textContent` = the number), difficulty → inline background color
  (easy/green, medium/yellow, hard/red, other/gray) + `data-difficulty`, state →
  glyph + `data-state` + `aria-label`. A legend row renders both keys. Idempotent:
  a prior grid in `host` is removed before re-render (one grid, never duplicated).
  Clicking a cell calls `onJump(id)` with that cell's question id — navigation is
  delegated to the caller; the renderer itself performs no DOM lookup beyond its own
  cells and **no network**. Built with `createElement`/`textContent` (no innerHTML of
  CB-derived strings); cell text is constrained to digits + fixed glyphs/labels.

### `src/entrypoints/content.ts` (wiring — integration glue)

Where the badger is (re)painted (`watchResultsList` / after `recordAttempt`), also
build cells from `readListQuestionIds(list)` + `getSeen(db)` and call
`renderNavGrid`, with `onJump: (id) => scrollToResume(list, id)`. The grid mounts in
the overlay host (`mountHost`) so its styling is scoped and it survives across
questions, consistent with our other persistent UI. No new boot network; still behind
`guardedStart`. (Boot is skipped under test — no `chrome.runtime` — so this glue is
exercised via the exported helpers, matching how the badger wiring is tested.)

## Testing (TDD)

Deterministic, mock-free, on synthetic fixtures only — **never** real CB content.

- `src/ui/nav-grid.test.ts`:
  - `buildNavCells` maps done→correct, missed→incorrect, absent→review; numbers are
    1-based in row order; difficulty carried through.
  - `renderNavGrid` renders one numbered cell per entry in order (cell text = number).
  - difficulty → color: easy=green, medium=yellow, hard=red; unknown/empty = a
    neutral (non-red/yellow/green) fill. Color is by difficulty, **not** state (a
    correct-easy and incorrect-easy cell share the green fill, differ by `data-state`).
  - state → `data-state` + glyph + accessible label for correct / incorrect / review.
  - a legend renders both the state key and the difficulty color key.
  - idempotent: re-render replaces, never duplicates (one grid, N cells, not 2N).
  - clicking a cell calls `onJump` with that cell's id; the renderer issues no
    `fetch`/network and does not enumerate or advance questions.
  - no CB content: every cell's `textContent` matches a safe pattern (digits + fixed
    glyphs/labels) — no stem/choice text can appear.
- `src/cb/list-reader.test.ts`: a row surfaces its `.difficulty-column` value as
  `difficulty`; still only id + node + difficulty, no content; absent cell → `''`.

## Out of scope / deferred

- A real "flagged for review" persisted state (would touch the store guard).
- Persisting grid open/closed UI preference.
- Clicking a cell to *open* the question (we scroll-into-view only, to stay strictly
  non-advancing); opening could be a later, still user-initiated enhancement.
