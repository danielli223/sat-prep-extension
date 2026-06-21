# Spec — Move "Open real Desmos" onto the bottom action bar (issue #29)

*Last updated: 2026-06-21*

> Decision record for [issue #29](https://github.com/danielli223/sat-prep-extension/issues/29):
> *Reading: move "Open Desmos" onto the bottom action bar.* This is the **deferred
> follow-up** explicitly logged in
> [`2026-06-19-desmos-side-dock.md`](2026-06-19-desmos-side-dock.md) ("Move 'Open
> Desmos' to the bottom bar… deferred to keep this change focused"). It is now being
> picked up. Pure intra-overlay control relocation — reaffirms, does not weaken, the
> no-iframe / zero-license bright line for Desmos.

## The request

The feedback doc wants the **"Open real Desmos"** button to live on the **bottom
action bar**, alongside the other primary actions, instead of sitting in its own
separate row below the note field. The issue's screenshot illustrates the visual
target with College Board's native footer (Back / Show correct answer and explanation
/ Add to PDF / Next).

## The constraint that shapes the answer

The screenshot's "bottom action bar" is **College Board's NATIVE footer**, which lives
in CB's own DOM. Injecting our button there would require **reading/mutating CB DOM
from `src/ui/`**, which the repo conventions forbid (CLAUDE.md: *"Keep CB-shape
knowledge in `src/cb/`"*, *"Don't read CB DOM from `ui/`"*). It would also fight the
overlay's own masking machinery (`mountAnswerOverlay` hides **every** non-host child of
`.answer-content` and runs a `MutationObserver` to hide any node CB injects later) and
couple our UI to CB's fragile markup.

The compliant realization of "a unified bottom action bar" is **our overlay's own
primary action row**, `.fp-actions` (currently `Check` / `Reveal explanation` /
`Next`). We move `Open real Desmos` up from the standalone `.fp-calc` row into
`.fp-actions`, entirely inside our Shadow DOM. The button's class (`.fp-desmos`),
handler (`onOpenDesmos` → `calculator.ts:openDesmos()`, which opens desmos.com in a
separate window), and wiring are **unchanged**; only its DOM position moves.

## What changes

`extension/src/ui/answer-overlay.ts`, `renderBody()`:

- Move `<button class="fp-desmos">Open real Desmos</button>` out of the trailing
  `<div class="fp-calc">` and into the `<div class="fp-actions">` row, positioned
  **before** `.fp-next`. `.fp-next` uses `margin-left:auto`, so placing Desmos before
  it keeps `Next` flush-right and pushes `Open real Desmos` to the left of it.
- The `Calculator` button (`.fp-calc-pin`, `onToggleCalc`) **stays** in `.fp-calc`.
  Issue #29 only asks to move Desmos; relocating Calculator is out of scope.
- `ANSWER_CSS`: the relocated `.fp-desmos` keeps its existing light secondary styling
  (it already coexists with `.fp-calc-pin`); no functional CSS change is required.
  Cosmetic harmonization within `.fp-actions` is the maker's call and carries no
  invariant impact.

Handler interface (`AnswerHandlers.onOpenDesmos`), the `wire()` listener
(`shadow.querySelector('.fp-desmos')…onOpenDesmos()`), and `calculator.ts` are
untouched.

## Invariants check

- **#1 Read rendered DOM only** — untouched; no CB endpoints; Desmos is `window.open`
  to desmos.com, not a fetch.
- **#2 Persist IDs + student data only** — untouched; no storage change.
- **#3 No AI on CB content** — untouched.
- **#4 User-initiated transitions** — untouched; the button opens a calculator, not a
  question transition.
- **#5 Nominative trademark use** — untouched.
- **#6 Fail-safe** — untouched.
- **No-iframe / zero-license for Desmos (Open item O1)** — **reaffirmed.** Desmos
  stays a separate window, never embedded.

## Follow-ups left open (carried from #37)

- **Unify the calculator with Desmos.** Still requires an in-page real-Desmos surface
  → the Desmos API (license) or an iframe (blocked). Needs a product + legal decision.
  Not done here.
