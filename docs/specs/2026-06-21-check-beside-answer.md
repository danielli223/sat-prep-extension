# Spec — Move the Check button beside the selected answer; morph it into "Explain" (issue #26)

*Last updated: 2026-06-21*

> Decision record for [issue #26](https://github.com/danielli223/sat-prep-extension/issues/26):
> *Reading: move the Check button beside the selected answer (like OnePrep); after Check, morph the
> button into Explain.* A pure layout + button-state change inside our own Shadow DOM. Crosses no
> bright line; the "Explain" affordance reuses the **existing** reveal-CB's-own-rationale path, never a
> model.

## The request

1. **Primary.** Move the **Check** button from the bottom action row so it sits **inline, beside the
   selected answer** — more intuitive than a button at the bottom of the page (the issue cites OnePrep,
   whose Check button sits next to the chosen choice).
2. **Related.** *"After Check, morph the button into Explain."* The same button, once you've checked,
   becomes the affordance that shows the explanation.

## The constraint that shapes the answer (invariant #3)

"Explain" must **never** mean an AI-generated explanation of a College Board question or rationale —
CB's terms bar using their content "in conjunction with generative AI" (`CLAUDE.md` §3). It does not
have to: the extension **already** ships the compliant affordance. The current **"Reveal explanation"**
button calls `onReveal` → `revealRationale(answerContent)` (`answer-overlay.ts`), which merely
**un-hides CB's own natively-rendered `.rationale` node** (hidden on mount). No model is involved
anywhere. "Explain" is therefore a **relabel of that existing reveal action**, wired to the same
`onReveal` handler — no generated text, no summarization, nothing fed to a model.

If "Explain" were ever taken to mean a model-written explanation/hint over CB content, that scope is
**REJECT**, not buildable. This spec implements only the un-hide-CB's-own-rationale meaning.

## Design

All changes live inside our Shadow DOM (`src/ui/answer-overlay.ts`) plus one wiring line in
`src/entrypoints/content.ts`. No new CB DOM is read (#1), nothing new is persisted (#2), no network
(#1), no question transition (#4 — Check still grades **in place**; it never auto-advances), no CB
branding (#5).

### 1. Move Check inline beside the selected answer

- There is still **one** `.fp-check` button (not one per row).
- **Multiple-choice (`kind: 'mc'`):** `.fp-check` starts **hidden** (no answer to check yet). When the
  student selects choice *X*, the selection handler in `wire()` moves `.fp-check` to be a child of
  `.fp-choice[data-letter="X"]` and reveals it — so it renders **beside the chosen answer**. Selecting a
  different choice moves it to that row.
- **Grid-in (`kind: 'grid'`):** there are no choice rows, so `.fp-check` is rendered **beside the
  grid-in input** and is always visible.
- The bottom `.fp-actions` row keeps only **Next**.

### 2. Morph Check → "Explain" after a check

- New exported helper `morphCheckToExplain(shadow)`: relabels the `.fp-check` button text to
  **"Explain"** and adds an `fp-explain` marker class. **Also hides the standalone `.fp-reveal`
  button** (see §3). Idempotent / no-op if the button is absent.
- `wire()` attaches a **single** click listener to `.fp-check` that branches on state: in the default
  state it calls `onCheck(pickValue())`; once morphed (`fp-explain` present) it calls `onReveal()`.
- `content.ts` calls `morphCheckToExplain(overlay)` immediately **after** `renderVerdict(...)` in
  `onCheck` — i.e. once a real grade attempt has happened (correct, wrong, **or** "couldn't grade").
  It is **not** called on the empty-answer prompt (`renderNeedAnswer`) or the stale-card guard
  (`renderStaleCard`) early-returns, so the button only becomes "Explain" after the student has
  actually committed an answer and we've graded it.

### 3. Keep the standalone "Reveal explanation" button — but hide it once Explain takes over

The standalone `.fp-reveal` button is **kept** (it stays in the bottom action row), for one reason
that surfaced from the existing resilience tests: it is the only way to reveal CB's explanation
**without first committing an answer**. That path matters — it backs the "I'm stuck, just show me"
case (and forcing a throwaway pick before revealing would record a spurious attempt and pollute the
student's weak-area stats). It is also what the `content.ts` async-injection resilience test exercises
(CB's `.rationale` is auto-injected ~150ms after show and must stay hidden until an explicit reveal,
**before any check**).

To avoid shipping **two** reveal controls at once (the very redundancy this UX issue is trying to
reduce), `morphCheckToExplain` **hides** `.fp-reveal` at the moment the inline button becomes
"Explain". So the affordance is unambiguous at every moment:

- **Before check:** bottom **"Reveal explanation"** (the peek-without-committing path); inline Check is
  hidden until you select.
- **After check:** inline **"Explain"** beside your answer; the bottom Reveal is hidden.

The `onReveal` handler in `content.ts` is unchanged and is reached through **both** affordances
(bottom Reveal pre-check; morphed Explain post-check) — both routing to `revealRationale` (un-hide
CB's own node). This matches OnePrep's Check-then-Explain flow while preserving the give-up path.

## Invariants check

| # | Invariant | This change |
|---|-----------|-------------|
| 1 | Read rendered DOM only; no CB endpoints | No new reads; no network. ✓ |
| 2 | Persist only IDs + student data | No new persistence; pure UI. ✓ |
| 3 | No AI on CB content | "Explain" = relabel of the existing `revealRationale` un-hide of CB's **own** node. No model. ✓ |
| 4 | Every transition user-initiated | Check still grades in place; morph never auto-advances. ✓ |
| 5 | Nominative trademark use only | No SAT/CB branding added. ✓ |
| 6 | Fail safe | Untouched. ✓ |

## Out of scope / follow-ups

- Any AI-authored explanation (forbidden — see above).
- Visual polish of the inline placement beyond what the unit tests assert is verified by a human via
  **`/verify-overlay`** on a real CB question (this diff touches `src/ui/`).
