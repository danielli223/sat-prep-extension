# Nav-Grid Collapsible "Show All" Navigator + Cell-Click-Opens-Question — Design

*Date: 2026-06-22 · Issue #76 · Status: approved (triage: BUILDABLE; invariants
#1/#2/#3/#4 in scope but each confirmed already satisfied by existing patterns)*

Follow-up to the question-grid navigator (Issue #25,
`docs/specs/2026-06-21-question-grid-navigator-design.md`). That design shipped two
things this issue revisits, and one it explicitly **deferred**:

- It shipped an **always-open** `position:fixed; bottom:0` strip with no collapse
  affordance — it permanently covers the bottom of the page.
- It wired cell-click to `scrollToResume` (scroll the row into view), and listed
  *"Clicking a cell to open the question"* under **Out of scope / deferred**.

Issue #76 picks up the deferred enhancement and fixes the always-open ergonomics.

## Problem

From real use, two complaints about the bottom navigator (`src/ui/nav-grid.ts`):

1. **It's always open and cannot be closed.** A fixed strip pinned to the bottom is
   permanently on screen and overlaps the page. It should be **collapsed by default**
   into a small toggle ("Questions · N") that the student clicks to **expand** the
   full grid, and clicks again (or a close control) to **collapse** it back out of
   the way.
2. **Clicking a number doesn't open that question — it only scrolls the list.** The
   cell-click is wired to `scrollToResume(listRoot, id)` (`content.ts`), which only
   moves scroll position on the results-list screen. The student expects clicking a
   cell to **take them into that question**, exactly as clicking that row's
   question-ID link in CB's list does.

## Desired behavior (acceptance criteria, restated)

- **A) Collapsible "show all" navigator.** Collapsed by default into a small toggle
  pill pinned at the bottom (no longer permanently covering the page). Clicking it
  expands the full grid — keeping the difficulty-color background, the state glyph
  encoding, the legend, and per-cell `aria-label`s — and collapses again on a second
  click / close control. When expanded it shows a cell for **every question in the
  currently-loaded set** (verified with a set larger than 10), not only the first
  few. Accessible: the toggle carries `aria-expanded` and points at the grid it
  controls (`aria-controls`).
- **B) Cell-click opens the question.** Clicking a cell navigates **into** that
  question (the question view actually changes), as if the student clicked that row's
  question-ID link — not merely a scroll.
- **Invariants preserved.** Cells stay number + fixed glyph only; no CB content
  stored or sent; navigation stays user-initiated.

## How "open the question" stays inside the bright lines

CB's results list renders, per row, a clickable `<button class="cb-btn">{id}</button>`
inside `td.id-column` (synthetic fixture: `src/cb/__fixtures__/results-list.html`).
That button is **CB's own** affordance for opening a question — the project already
actuates CB transitions exactly this way (`clickCbNext` does `btn.click()` on CB's
own Next button, `content.ts`). So "open the question" is implemented by clicking the
row's already-rendered `cb-btn` for that id:

- **#4 user-initiated, no prefetch/enumeration/auto-advance.** The open is driven by
  the student's own click on a cell — a synchronous user gesture, one transition per
  click. We click a node **already present in the rendered DOM**; we never fetch,
  synthesize/enumerate an id, or navigate by URL/id. This is strictly more
  user-initiated than CB's own grid (which CB renders), and identical in posture to
  the existing `clickCbNext`.
- **#1 rendered DOM only.** No fetch/XHR/WebSocket; we click an existing element.
- **#2 / #3.** Nothing read, persisted, or sent; no CB content to any model. The cell
  still carries only `number + fixed glyph`.

## How "collapsed by default + show all" stays inside the bright lines

- **Collapse/expand is pure local DOM state** — no persistence, no store/guard change,
  no network. (We deliberately do **not** persist the open/closed preference; that
  would be a store change and is out of scope, matching #25's deferral of a persisted
  UI preference.)
- **"Show all" means all currently-loaded rows**, built from
  `readListQuestionIds(listRoot)` exactly as today. We do **not** enumerate or
  prefetch to discover questions not already in CB's DOM (invariant #4). If CB
  virtualizes its list (keeps only a window of rows in the DOM), "all" is scoped to
  the loaded rows and that limit is noted — never worked around by enumeration. In
  practice CB's results list renders the full loaded selection as `<tr>` rows, so the
  grid already reflects the whole loaded set; this issue makes the always-mounted
  strip *collapsible* and the cell-click *open*, it does not change which rows feed it.

## Components

### `src/ui/nav-grid.ts` (our interaction layer — extended, stays pure)

The renderer keeps its current contract — pure, idempotent, no DOM lookup beyond its
own cells, **no network**, cell text = `number + fixed glyph` via `textContent` only.
Two additions:

- **Collapsed-by-default toggle.** `renderNavGrid` mounts a small toggle control
  ("Questions · N", where N is the cell count) pinned at the bottom; the grid of cells
  + legend is **hidden by default** and revealed only when expanded. Track state with
  a `data-collapsed` attribute (or equivalent) on the grid container, toggled in
  place. Add `aria-expanded` on the toggle and `aria-controls` referencing the
  expandable region. A second click on the toggle (and/or a close control) collapses.
  Re-render remains idempotent (one grid, never duplicated). The whole control
  collapses to the toggle's footprint so it no longer covers the page.
- **Open semantics via the existing `onJump` seam.** The renderer does **not** learn
  how to open a question — that is CB-shape knowledge and stays out of `src/ui/`.
  Cell-click still calls `onJump(id)`; the *meaning* of `onJump` changes in the
  wiring (below). The renderer's "no network / delegated navigation" contract is
  unchanged.

`buildNavCells` is unchanged: it already maps the full ordered loaded rows → cells, so
"show all loaded" needs no builder change.

### `src/ui/resume.ts` (open-by-click helper — co-located with the row-node lookup)

Add a small helper next to `scrollToResume` (which already does the
`readListQuestionIds(listRoot)` row-node lookup). It finds the row for `id` and clicks
that row's CB question button to open the question, falling back to scroll-into-view
when the button isn't present (e.g. the row scrolled out / a virtualized window):

```
openListQuestion(listRoot, id):
  row = readListQuestionIds(listRoot).find(r => r.id === id)
  if !row: return null
  btn = row.node.querySelector('.id-column button')   // CB's own open affordance
  if btn: btn.click(); return row.node
  scrollToResume(listRoot, id); return row.node       // fallback: at least bring it into view
```

The `.id-column button.cb-btn` selector is CB-shape knowledge. It lives in `resume.ts`
beside the existing `list-reader` usage (the same place `scrollToResume`'s row lookup
lives) rather than inlined in `nav-grid.ts`, honoring "keep CB-shape knowledge out of
`ui/` core renderers." (If preferred during implementation, the selector may instead
live behind a `src/cb/` helper; either keeps it out of the pure renderer.)

### `src/entrypoints/content.ts` (wiring — one line)

In `refreshBadges`, change the nav-grid `onJump` from
`(id) => scrollToResume(listRoot, id)` to `(id) => openListQuestion(listRoot, id)` so
a cell-click opens the question. Everything else (single `getSeen` read, mounting in
the overlay host shadow root, repaint triggers) is unchanged. No new network, still
behind `guardedStart`.

## Why no bright line is touched (summary)

- **#1 rendered DOM only.** No fetch/XHR/WebSocket; cell-click clicks an existing
  in-DOM CB button. No new host permission.
- **#2 persist only IDs + student data.** Nothing new persisted (collapse state is
  ephemeral DOM; open/close preference deliberately not stored). `guard.ts` and the
  store schema untouched.
- **#3 no AI.** None.
- **#4 user-initiated; no prefetch/enumeration/auto-advance.** Open is one
  synchronous click per user gesture on an already-rendered row button; "show all" is
  the already-loaded rows only, never enumerated/prefetched.
- **#5 trademark.** Toggle label is generic ("Questions"); no SAT/College Board/acorn.
- **#6 fail safe.** Mounts inside the existing boot path behind `guardedStart`; no new
  always-on network.

`src/cb/` gains at most the `.id-column button` open selector (if a `src/cb/` helper
is chosen) — a click target, never a content read — covered by the existing
`results-list.html` fixture which already carries the `cb-btn` buttons.

## Testing (TDD)

Deterministic, mock-free where possible, on synthetic fixtures only — **never** real
CB content.

- `src/ui/nav-grid.test.ts` (extend; keep all existing assertions green):
  - **Collapsed by default:** after `renderNavGrid`, the cells/legend region is hidden
    (e.g. not visible / `data-collapsed` set) while a toggle control is present and
    shows the count.
  - **Expand on toggle click:** clicking the toggle reveals the cells + legend
    (`aria-expanded` flips to `true`); the difficulty backgrounds, state glyphs,
    legend, and per-cell `aria-label`s are all present when expanded.
  - **Collapse again:** a second toggle click (or close control) hides them and flips
    `aria-expanded` back to `false`.
  - **Show all loaded:** with a >10-cell input, every cell is rendered when expanded
    (cell count === input length) — no implicit cap.
  - **Accessibility:** toggle has `aria-expanded` and `aria-controls` referencing the
    expandable region.
  - **Unchanged contracts still hold:** one numbered cell per entry; color by
    difficulty not state; `data-state` + glyph + label; legend both keys; idempotent
    re-render; clicking a cell calls `onJump` with that cell's id; **no `fetch`**; cell
    text matches the safe `digits + fixed glyph` pattern.
- `src/ui/resume.test.ts` (extend) — the open helper:
  - `openListQuestion(listRoot, id)` **clicks that row's `.id-column` button** (assert
    via a click spy on the right row's button) and returns the row node.
  - It clicks the button for the **matching id only** (not another row's).
  - **Fallback:** when the row has no clickable button, it falls back to
    `scrollIntoView` (and does not throw); unknown id → `null`, no click.
  - **No network:** the helper issues no `fetch` (invariants #1/#4 — we click an
    existing node, never fetch/enumerate).

## Out of scope / deferred

- Persisting the collapsed/expanded preference across reloads (store change).
- A real "flagged for review" persisted state (unchanged from #25).
- Reaching questions **not** in CB's loaded DOM ("show all selected" beyond loaded) —
  forbidden by invariant #4; scoped to loaded rows with the limit noted.
