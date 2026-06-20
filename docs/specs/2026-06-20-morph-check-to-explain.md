# Spec — After Check, morph the button into "Explain" (issue #27)

*Last updated: 2026-06-20*

> Decision record for [issue #27](https://github.com/danielli223/sat-prep-extension/issues/27):
> *Reading: after the user presses **Check**, switch the button to **"Explain"**.* A pure
> client-side UI interaction change in the answer overlay. Crosses no bright line — reaffirms
> invariant #3 (no AI on CB content): "Explain" reveals College Board's **own** native rationale and
> synthesizes nothing.

## The request

When the student presses **Check**, switch the action button to **"Explain."** This saves vertical
space at the bottom of the modal, so when the explanation appears the student can see both the
explanation and the question at the same time. *(Related notes in the source doc: Check-button
placement, and the "explanation-too-far-down" layout issue.)*

## The constraint that shapes the answer

"Explain" must mean exactly one thing: **un-hide College Board's already-rendered native rationale.**
It must never generate, summarize, or synthesize an explanation — that would feed CB content to a
model and cross **bright-line invariant #3**. The compliant primitive already exists: the overlay's
Reveal control calls `onReveal` → `revealRationale(answerContent)` (`answer-overlay.ts`), the **sole
un-hider** of CB's own `.rationale` node, which CB renders natively. The morph is a relabel of that
control, not new behavior, and no new persistence or network is introduced (invariants #1, #2 hold).

## The design

`renderVerdict` (`src/ui/answer-overlay.ts`) is the function that runs once a Check resolves — for
both a graded result and the ungraded "couldn't grade" case — and it already mutates the overlay.
It becomes the morph trigger. The needs-answer (`renderNeedAnswer`) and stale-card
(`renderStaleCard`) paths return *before* `renderVerdict` is reached in `onCheck`
(`content.ts`), so they deliberately do **not** morph: the student has not completed a real check.

The morph, applied inside `renderVerdict` (both the graded and ungraded branches):

1. **Hide `.fp-check`** (`style.display = 'none'`, the house hide idiom). The student has checked;
   re-checking is already blocked by the per-question `checked` guard in `content.ts`.
2. **Relabel the reveal control to "Explain"** — the existing `.fp-reveal` button keeps its class and
   its `onReveal` → `revealRationale` wiring; only its text (and primary styling) change. The action
   row collapses from `[Check] [Reveal explanation] [Next]` to `[Explain] [Next]`, freeing the bottom
   space exactly when the explanation is about to appear.

### Why relabel `.fp-reveal` rather than re-wire `.fp-check`

Two existing tests reveal CB's rationale **without** a prior Check
(`content.test.ts`, "Reveal un-hides CB's OWN native rationale" and "keeps CB's ASYNC-injected
rationale HIDDEN until Reveal"). Keeping `.fp-reveal` present and wired pre-check preserves that
capability and keeps those tests green. The morph is therefore strictly additive: nothing is removed
from the pre-check state; post-check, Check disappears and the reveal control reads "Explain." The
user-visible outcome — a single "Explain" button where the action row was — matches the issue, and
the space saving lands precisely post-check, when the explanation shows.

## Invariants check

- **#1 (rendered DOM only):** no CB endpoint touched. ✓
- **#2 (persist only IDs + student data):** no new persistence; `onReveal` still records only the
  question ID in `revealedIds`. Rationale text is never read into the store. ✓
- **#3 (no AI on CB content):** "Explain" is a relabel of Reveal; it un-hides CB's own `.rationale`
  and feeds nothing to a model. **Load-bearing.** ✓
- **#4 (user-initiated transitions):** the morph fires only on the student's Check click; revealing
  still requires the student to click "Explain." No auto-advance/prefetch. ✓
- **#5, #6 (trademark / fail-safe):** untouched. ✓

## Out of scope

- Removing pre-check reveal (kept, per above).
- Persisting the morphed state across CB's in-place re-mounts — the morph shares the same re-render
  characteristics as the existing verdict coloring (both re-derive from `renderBody` on re-mount,
  and `showQuestion` re-arms `checked`). Not a regression introduced here.
- Any change to `src/cb/`, `store.ts`, `guard.ts`, network/host permissions, or branding.

## Visual verification

The diff touches `src/ui/`. Per the issue loop, the reviewer should run **`/verify-overlay`** on a
real CB question before merging (content-free behavioral check). In headless CI there is no dev
Chrome and no human, so the PR records **"visual check pending human review."**
