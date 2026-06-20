# Weak-Area Difficulty Filter — Design

*Date: 2026-06-18 · Issue #34 · Status: approved (triage: BUILDABLE, no invariant at risk)*

## Problem

The journal panel's "Weak areas (worst first)" shows one accuracy bar per skill
aggregated over *all* difficulties. A student can't see that they're fine on Easy
but failing Hard within the same skill. Issue #34 asks to break the per-skill
percentages down by difficulty via a multi-select filter.

## Why no bright line is touched

This is pure aggregation over **already-persisted student `Attempt` data**.
`Attempt.difficulty` is an existing stored field (`src/types.ts`). No CB DOM read,
no `qbank-api`/`collegeboard.org` call (#1), no new persisted shape — and if we
persist the chosen difficulties it's student-own UI preference, never
question-text-shaped (#2). No model touches anything (#3). The filter only re-derives
a list the student already opened; no transition, prefetch, or enumeration (#4).
No branding/network change (#5, #6). The fragile `src/cb/` layer is untouched.

## stats.ts changes

Add an options arg to `deriveStats`:

```ts
deriveStats(attempts: Attempt[], opts?: { difficulties?: Set<string> }): Stats
```

- **Semantics — "no selection = all":** `opts.difficulties` `undefined` or empty ⇒
  behaves exactly as today (all difficulties). A non-empty set restricts the
  latest-attempt pool to attempts whose `difficulty` is in the set.
- **Order of operations is preserved:** tombstone skip (`a.deleted`) and
  latest-attempt-per-question both still apply. The difficulty filter is applied to
  the *raw* attempts **before** the latest-per-question reduction, so a question's
  surviving attempt is the latest one *within the selected difficulties* (a question
  whose latest attempt is at an unselected difficulty drops out, as intended).
- **Zero-bucket / NaN guard:** a skill with no attempts in the selected difficulties
  is **omitted** from `perSkill` (it never enters the `bySkill` map), so no `0/0`.
  The existing `accuracy: t ? c / t : 0` guard stays. Top-line `total`/`correct`/
  `accuracy`/`seen` are computed over the filtered pool too; `streakDays` stays over
  *all* days (a UI difficulty filter shouldn't rewrite the activity streak).

## panel.ts / host.ts changes

- Add a difficulty multi-select control directly above the
  `<h3>Weak areas (worst first)</h3>` heading. Options are the distinct difficulties
  present in the data (e.g. Easy / Medium / Hard) — derived, not hardcoded — rendered
  as checkboxes/chips with a `data-difficulty` hook.
- `PanelVM` gains `difficulties: string[]` (the option list) and `selected: Set<string>`
  (current selection; empty = all). `renderPanel` renders the control + the weak-area
  list filtered to `selected`.
- On change, the control re-derives via `deriveStats(attempts, { difficulties: selected })`
  and re-renders only the weak-area list worst-first. Existing `data-skill` Practice
  coachmark hooks on each bar are preserved unchanged.
- Empty-state copy ("Answer a few questions to see your weak areas.") still appears
  when the filtered list is empty.
- Minimal CSS (chip/checkbox row) added to `host.ts` `BASE_CSS` under `fp-`-prefixed
  classes, consistent with existing panel styling.

## Optional (deferred)

Persist `selected` as a student UI preference (student-own data only, never
question-shaped). Out of scope for v1 unless trivial; default is in-memory per open.

## Testing (TDD)

Deterministic, mock-free. `stats.test.ts`: filter `{Medium,Hard}` → right per-skill
correct/total/accuracy; empty & full selection == unfiltered; latest-attempt +
tombstone hold under filter; skill with zero attempts in the selection omitted, no
NaN. `ui/panel.test.ts`: multi-select renders the options; changing selection
re-renders worst-first with filtered %; empty-state copy still appears.
