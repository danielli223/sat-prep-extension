# Reading declutter — Implementation Plan (issue #23)

> **Scope:** one source file (`extension/src/ui/answer-overlay.ts`) + its colocated test.
> Pure presentation change to our own overlay. No store, no CB-read, no build/CI change.
> **Reference:** [`docs/specs/2026-06-21-reading-declutter-answer-top.md`](../specs/2026-06-21-reading-declutter-answer-top.md).

## Steps

- [ ] **Test first** (`test-author`, `answer-overlay.test.ts`):
  - Calculator `.fp-calc` present for a `section: 'Math'` vm; absent for `section: 'Reading and Writing'`.
  - Note field still present + `onNote` still fires on a Reading vm (feature preserved).
  - Note starts collapsed (no `fp-note-open`); gains the open state after `renderVerdict` and after
    `renderNeedAnswer`.
  - `.fp-choices` precedes `.fp-actions` in DOM order (answer stays high).
  - Confirm they fail for the right reason against current code.

- [ ] **Implement** (`maker`, `answer-overlay.ts`):
  - `renderBody`: emit the `.fp-calc` block only when `/math/i.test(vm.section)`.
  - `renderBody`: render the note label/textarea with a collapsed default state.
  - `renderVerdict` + `renderNeedAnswer`: add the `fp-note-open` state when a verdict/prompt is shown.
  - `ANSWER_CSS`: collapsed-vs-open note styling; trim the largest stacked `margin-bottom` gaps.
  - Keep `wire()` resilient — `.fp-calc-pin`/`.fp-desmos` listeners only attach when those nodes exist.

- [ ] **Review** (`checker`): tests not weakened, full suite + guards green, no bright line crossed,
  scope tight (single source file + its test + the two docs).

- [ ] **PR**: `Closes #23`, triage verdict, what changed, raw test counts, checker verdict,
  "visual check pending human review — run `/verify-overlay` on a real CB Reading question".

## Risks / watch-items

- The existing "wires the remaining controls" test depends on the Math vm keeping `.fp-calc-pin` /
  `.fp-desmos`. The `/math/i` gate preserves that — keep that test green, do not edit it.
- `wire()` must not throw when the calculator nodes are absent (Reading) — guard the `querySelector`
  before `addEventListener`.
- Collapsing the note must not break the `onNote` change-event contract used elsewhere.
