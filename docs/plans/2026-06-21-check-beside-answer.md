# Plan — Check beside the selected answer + morph to "Explain" (issue #26)

*Last updated: 2026-06-21*

**Reference:** `docs/specs/2026-06-21-check-beside-answer.md`.

Maker/checker loop. Tests are written first (test-author), then the maker makes them green without
touching the tests, then the checker audits. UI diff → reviewer runs `/verify-overlay` (advisory).

## Files

- `extension/src/ui/answer-overlay.ts` — move `.fp-check` inline; add `morphCheckToExplain` (relabels
  Check→Explain **and hides** `.fp-reveal`); single state-aware click listener. The standalone
  `.fp-reveal` button is **kept** in the markup.
- `extension/src/entrypoints/content.ts` — import `morphCheckToExplain`; call it after `renderVerdict`
  in `onCheck`. (The `onReveal` handler is unchanged.)
- `extension/src/ui/answer-overlay.test.ts` — new/updated overlay tests (test-author).
- `extension/src/entrypoints/content.test.ts` — **no changes** (the standalone `.fp-reveal` stays, so
  the reveal/async-leak resilience tests are untouched).

## New affordance contract (what the tests pin down)

- `.fp-check` exists for both `mc` and `grid`.
- **mc:** `.fp-check` is hidden before any selection; selecting `X` makes
  `.fp-choice[data-letter="X"] .fp-check` resolve (button moved into that row) and visible. Clicking it
  fires `onCheck` with the picked letter.
- **grid:** `.fp-check` is visible and clicking it fires `onCheck` with the typed value.
- `morphCheckToExplain(shadow)` → `.fp-check` text becomes `"Explain"`, gains `fp-explain`; a subsequent
  click fires `onReveal` (**not** `onCheck`). Reveal still routes to `revealRationale` (un-hide CB's
  native `.rationale`) — no generated text. The call **also hides** the standalone `.fp-reveal` button
  (it remains in the DOM but is no longer shown — no two reveal controls at once).
- The standalone `.fp-reveal` button still exists (pre-check peek path); it is only hidden after morph.

## Steps

1. **test-author** — write the failing overlay tests for the contract above (hidden-until-select,
   move-beside-selected, `morphCheckToExplain` relabel + reroute-to-`onReveal` + hides `.fp-reveal`).
   Keep the standalone `.fp-reveal` button in the "wires the remaining controls" test (it is NOT
   removed). Leave `content.test.ts` unchanged. Confirm the new tests fail for the right reason (no
   morph/inline-move yet). Commit `test: …`.
2. **maker** — implement the move + morph + removal + the `content.ts` wiring line. Minimal change to
   green. Keep `npm run typecheck` and the full suite green. Do not touch tests.
3. **checker** — audit: tests not weakened (the reveal contract is still asserted, just via the morphed
   button; `revealRationale` is still the sole un-hider of CB's own node), suite + guards green, no
   bright line crossed (#3 especially — confirm no model call or generated explanation), scope tight.
4. **PR** — `Closes #26`. UI diff → note the reviewer should run `/verify-overlay`; in headless CI
   record "visual check pending human review".

## Risks / watch

- **#3 (no AI on CB content):** the morph must reuse `onReveal`/`revealRationale` only. Any text
  generation/summarization of CB content is a hard stop.
- **Don't auto-advance (#4):** the morph turns Check into Explain (reveal), never into Next.
- **Grid-in path:** `.fp-check` must stay reachable/visible for `kind: 'grid'` (no choice rows to host
  it).
- **Existing resilience tests:** the rationale async-injection/hide contract in `content.test.ts`
  reveals **without checking** via `.fp-reveal`. Keeping that button (hidden only after morph) leaves
  those tests untouched — do not remove `.fp-reveal`. (This is why Option F keeps it: removing it would
  break the show-time-leak test, which has no honest morph-based reroute, and would force a stuck
  student to record a throwaway attempt just to see the explanation.)
