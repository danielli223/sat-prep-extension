# Weak-Area Difficulty Filter — Implementation Plan

> **For agentic workers:** use superpowers:test-driven-development. Failing test
> first, watch it fail for the right reason, then minimal code. Steps use checkbox
> (`- [ ]`) syntax. Run all `npm`/`vitest` commands from
> `extension/`.

**Goal:** break the journal panel's per-skill weak-area percentages down by
difficulty via a multi-select filter. Pure aggregation over already-persisted
`Attempt` data — no CB read, no network, no AI, no `src/cb/` change.

**Reference:** `docs/specs/2026-06-18-weak-area-difficulty-filter-design.md`.

---

## Task 1: Failing stats tests (lock the spec before any code)

**Files:** modify `src/stats.test.ts`

- [ ] Add tests for `deriveStats(attempts, { difficulties })`:
  - filter `new Set(['Medium','Hard'])` → per-skill `correct`/`total`/`accuracy`
    count only Medium+Hard attempts; an Easy-only skill is **absent** from `perSkill`.
  - `undefined`, empty `Set`, and a `Set` of all present difficulties each equal the
    unfiltered result (deep-equal `perSkill`).
  - latest-attempt-per-question still wins *within* the filter (a question whose
    latest attempt is an unselected difficulty drops out; older selected one used per
    spec — assert the surviving result).
  - tombstoned (`deleted:true`) attempts stay excluded under a filter.
  - a skill with zero attempts in the selected difficulties is omitted — assert no
    `NaN` accuracy anywhere (`perSkill.every(s => Number.isFinite(s.accuracy))`).
- [ ] Run `npx vitest run src/stats.test.ts` — confirm FAIL (arg ignored / wrong counts),
  not a typo. Watch it fail for the right reason.

## Task 2: Implement the stats filter

**Files:** modify `src/stats.ts`

- [ ] Add `opts?: { difficulties?: Set<string> }` to `deriveStats`. Before the
  latest-per-question loop, when `opts.difficulties?.size`, `continue` on any attempt
  whose `difficulty` is not in the set (alongside the existing `a.deleted` skip).
  Empty/undefined set ⇒ unchanged behavior.
- [ ] Keep tombstone skip, latest-attempt reduction, `accuracy: t ? c / t : 0`, and
  the omit-zero-bucket behavior (skill never enters `bySkill` ⇒ not in `perSkill`).
  Leave `streakDays` over all days.
- [ ] Run `npx vitest run src/stats.test.ts` — confirm PASS. Run `npx vitest run` to
  confirm nothing else broke (journal.ts wrapper still green).

## Task 3: Failing panel tests

**Files:** modify `src/ui/panel.test.ts`

- [ ] Extend `PanelVM` fixture with `difficulties: ['Easy','Medium','Hard']` and
  `selected: new Set<string>()`.
- [ ] Add tests: the control renders one option per `difficulties` entry with a
  `data-difficulty` hook above "Weak areas (worst first)"; toggling a selection
  re-renders the weak-area list worst-first with filtered % (assert a known bar's
  text changes / order); empty filtered result still shows the empty-state copy;
  existing `data-skill` Practice coachmark hook still present on each bar.
- [ ] Run `npx vitest run src/ui/panel.test.ts` — confirm FAIL.

## Task 4: Implement the panel control

**Files:** modify `src/ui/panel.ts`, `src/ui/host.ts`

- [ ] Extend `PanelVM` with `difficulties: string[]` and `selected: Set<string>`.
  Render a `fp-`-prefixed checkbox/chip row (each carrying `data-difficulty`) above
  the weak-areas `<h3>`. Filter the rendered `perSkill` by `selected` (empty = all),
  preserving worst-first order and the `data-skill` coachmark links.
- [ ] Wire `change` on the control to re-derive + re-render the weak-area list only.
  Keep the empty-state path.
- [ ] Add minimal chip/checkbox CSS to `host.ts` `BASE_CSS` (`fp-` classes).
- [ ] Run `npx vitest run src/ui/panel.test.ts` — confirm PASS.

## Task 5: Wire the panel mount + verify

**Files:** modify `src/entrypoints/content.ts`, `src/entrypoints/content.test.ts`

- [ ] In `handleMessage`, pass `difficulties` (distinct from the attempts) and an
  initial empty `selected` into the `PanelVM`; on the control's change, re-call
  `deriveStats(attempts, { difficulties: selected })` and re-render. Keep the existing
  coachmark binding after render. Adapt/extend the content test accordingly.
- [ ] Run `npx vitest run && npx tsc --noEmit && npm run build` — all green,
  `tsc` exits 0, chrome bundle builds. (Optional: `:firefox`/`:edge`.)
- [ ] Optional live check via `npm run dev:chrome` / `npm run reload`: open the
  journal, toggle difficulties, confirm the weak-area list re-filters with no console
  errors.
