# Move "Open real Desmos" onto the bottom action bar — Implementation Plan

> **For agentic workers:** failing test first, watch it fail for the right reason,
> then minimal code. Run all `npm`/`vitest` commands from `extension/`.

**Goal:** relocate the `Open real Desmos` button (`.fp-desmos`) from the standalone
`.fp-calc` row into our overlay's primary action row (`.fp-actions`), positioned
before `.fp-next` so `Next` stays flush-right. Pure intra-overlay layout change — no
CB read, no network, no AI, no storage change, no `src/cb/` change.

**Reference:** `docs/specs/2026-06-21-desmos-action-bar.md`.

---

## Task 1: Failing structural test (lock the spec before any code)

**Files:** modify `src/ui/answer-overlay.test.ts`

- [ ] Add a test that mounts the overlay and asserts `.fp-desmos` is now a
  **descendant of `.fp-actions`** (e.g. `shadow.querySelector('.fp-actions .fp-desmos')`
  is non-null), and that it is **before** `.fp-next` within that row.
- [ ] Assert `.fp-desmos` is **no longer** inside `.fp-calc`
  (`shadow.querySelector('.fp-calc .fp-desmos')` is null), and that `.fp-calc-pin`
  still IS in `.fp-calc`.
- [ ] Keep/confirm the existing behavioral assertion that clicking `.fp-desmos` fires
  `onOpenDesmos` (it stays green — class name unchanged).
- [ ] Run `npx vitest run src/ui/answer-overlay.test.ts` — confirm the new structural
  assertions FAIL for the right reason (button still in `.fp-calc`), not a typo.

## Task 2: Move the button

**Files:** modify `src/ui/answer-overlay.ts`

- [ ] In `renderBody()`, remove `<button class="fp-desmos">Open real Desmos</button>`
  from the `<div class="fp-calc">` block and insert it into `<div class="fp-actions">`
  immediately before `<button class="fp-next">Next</button>`.
- [ ] Leave `.fp-calc` holding only `<button class="fp-calc-pin">Calculator</button>`.
- [ ] Leave `wire()`, `AnswerHandlers`, and `ANSWER_CSS` selectors intact. `.fp-desmos`
  keeps its existing styling; no CSS rename needed. (Optional cosmetic tidy only.)
- [ ] Run `npx vitest run src/ui/answer-overlay.test.ts` — confirm PASS.

## Task 3: Verify nothing else broke

**Files:** none

- [ ] Run `npx vitest run` (full suite) and `npm run typecheck` — all green, `tsc`
  exits 0. The guard/store tests (`tests/guard-ci.test.ts`, `src/guard.test.ts`) must
  stay green — this change touches no CB endpoint, persistence, or AI surface.
- [ ] `src/ui/` diff → visual check is human-gated. In headless/CI there is no dev
  Chrome and no human, so record "visual check pending human review" in the PR body;
  reviewer should run `/verify-overlay` before merge.
