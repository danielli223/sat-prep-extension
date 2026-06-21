# Remove the Start-Panel Reassurance Banner — Plan

*Date: 2026-06-21 · Issue #21 · Spec: docs/specs/2026-06-21-remove-reassurance-banner-design.md*

Maker/checker loop (issue-loop skill). Single shared worktree on
`loop/issue-21-remove-reassurance-banner`.

## Steps

1. **Test (locked first).** In `src/ui/start-panel.test.ts`, replace the assertion
   `expect(shadow.querySelector('.fp-onboarding')!.textContent).toContain('never store them')`
   with `expect(shadow.querySelector('.fp-onboarding')).toBeNull()`. Confirm it fails
   for the right reason against current code (banner still present). Commit `test:`.

2. **Implement.** Remove the `<div class="fp-onboarding">…</div>` block from
   `src/ui/start-panel.ts` and the orphaned `.fp-onboarding{…}` rule from
   `src/ui/host.ts`. No event handlers reference the banner, so no JS wiring changes.

3. **Verify green.** From `extension/`: `npm run typecheck && npm test` — the full
   suite (incl. the legal guard `tests/guard-ci.test.ts`) stays green; the inverted
   start-panel assertion now passes; popup/privacy/onboarding tests unchanged.

4. **Review.** Checker confirms tests not weakened, suite + guards green, §5 disclaimer
   still rendered, scope tight.

## Visual check

UI diff (`src/ui/`). Per skill step 6.5, the overlay's real rendering wants human eyes
via `/verify-overlay`. Headless/CI has no dev Chrome and no human → record "visual
check pending human review" in the PR body; it never blocks the pipeline.
