# Spec — Reading: reduce overlay clutter so the answer shows near the top (issue #23)

*Last updated: 2026-06-21*

> Decision record for [issue #23](https://github.com/danielli223/sat-prep-extension/issues/23):
> *Reading: reduce clutter so the answer shows near the top without scrolling.* A pure presentation
> change to **our own** Shadow-DOM overlay (`extension/src/ui/answer-overlay.ts`). Crosses no
> bright-line invariant — see the invariants check below.

## The request

On Reading questions the overlay stacks extra controls (the "Why did you miss it?" note field and the
**Calculator / Open real Desmos** buttons) below the answer choices. The screenshot shows the note
field eating vertical space, pushing the answer block down so the student can't see CB's question and
our answer choices together without scrolling. The ask: **trim the clutter and keep the answer near
the top** so question + answer are co-visible.

## What is "clutter" here — and what is not

- **The Math calculator on a Reading question is pure clutter.** `Calculator` / `Open real Desmos` are
  Math-only tools. A Reading question never needs them, yet they currently render on every question and
  consume a whole row at the bottom of the overlay. **Remove them on non-Math sections.**
- **The note field is a feature, not removable clutter.** "Why did you miss it?" is the student's *own*
  journal data (invariant #2's protected category) and the mistake-journal loop depends on it. We keep
  it, but **collapse it so it costs near-zero vertical space until the student has checked an answer** —
  the moment a note is actually useful. Before Check it renders as a single compact affordance; after a
  verdict is written it expands in place.
- **Spacing is clutter too.** The stacked `margin-bottom` gaps (progress, choices, actions, verdict,
  note, calc) add up to real scroll. Tighten them modestly without changing the visual language.

The answer choices already render directly under the one-line progress row, so the primary win is
*removing what sits below and competes for the fold*, plus reclaiming inter-block spacing — not
reordering the choices themselves.

## The change (all in `extension/src/ui/answer-overlay.ts`)

1. **Gate the calculator on section.** Render the `.fp-calc` block only when the question is Math.
   Use a tolerant, case-insensitive check on `vm.section` (`/math/i`) rather than an exact string match
   so a CB taxonomy-label tweak degrades to *showing* the calculator (safe), never to a crash. Reading's
   section is `"Reading and Writing"`, which does not match, so the calculator disappears there.
2. **Collapse the note until a verdict exists.** The note label/textarea render collapsed by default
   (compact, single-line, not pushing the choices down). `renderVerdict` / `renderNeedAnswer` expand it
   (add an `fp-note-open` state) so it is full-size exactly when the student wants to journal a miss.
   The `onNote` wiring and the change-event contract are unchanged.
3. **Tighten spacing** in `ANSWER_CSS` — trim the largest stacked `margin-bottom` gaps so the block is
   shorter overall. No color/typography/branding change.

`CardVM` already carries `section`, so `view-model.ts` needs no change and no new CB DOM read happens at
render time.

## What must NOT change

- Math keeps its calculator (the existing "wires the remaining controls" test exercises `.fp-calc-pin`
  / `.fp-desmos` against the default Math vm — it stays green).
- The note feature stays first-class; `onNote` still fires on `change` with the trimmed value.
- Choices render before the actions row (DOM order preserved).
- The masking / MutationObserver / teardown logic (mount + unmount) is untouched.
- No change to Check / Reveal / Next wiring or to any transition logic.

## Invariants check (CLAUDE.md §1–6)

1. **DOM-only / no CB endpoint** — the Math/Reading split reads `CardVM.section`, already populated
   upstream by `cb/reader.ts`; no new CB read at render time. ✅
2. **Persist only IDs + student data** — no store path touched; reordering/hiding our own controls
   writes nothing. The note (student data) is preserved. ✅
3. **No AI on CB content** — "declutter" means hiding/collapsing *our own* buttons and the student's own
   note. No CB question/choice/passage/rationale is summarized, explained, or fed to a model. CB renders
   its question and rationale natively, untouched. ✅
4. **User-initiated transitions** — Check/Reveal/Next handlers unchanged; no auto-advance/prefetch. ✅
5. **Nominative trademark use** — no branding/icon/name change. ✅
6. **Fail safe** — kill-switch / block-detect untouched. ✅

No CI guard (`guard-ci`, store guard, contract-check) is implicated by a markup/CSS reorder.

## Visual verification

The diff touches `src/ui/`, so the overlay's real rendering needs human eyes: the PR notes the reviewer
should run **`/verify-overlay`** on a real CB Reading question (calculator absent, answer co-visible with
the question, note collapses/expands correctly) before merging. In headless/CI there is no dev Chrome,
so this is recorded as *visual check pending human review*.

## Test surface

Extend `extension/src/ui/answer-overlay.test.ts`:
- Calculator (`.fp-calc` / `.fp-calc-pin` / `.fp-desmos`) is **absent** when `vm.section` is
  `"Reading and Writing"` and **present** when `vm.section` is `"Math"`.
- The note field still renders on Reading (feature preserved) and `onNote` still fires.
- The note is collapsed by default and gains its open state after `renderVerdict` / `renderNeedAnswer`.
- Choices (`.fp-choices`) still precede the actions row (`.fp-actions`) in DOM order.
