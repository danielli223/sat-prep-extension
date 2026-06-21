# Plan — Remove the answer-overlay taxonomy/position banner (issue #19)

*Last updated: 2026-06-21*

Implements [spec 2026-06-21-remove-overlay-banner](../specs/2026-06-21-remove-overlay-banner.md) for
[issue #19](https://github.com/danielli223/sat-prep-extension/issues/19). Pipeline: issue-loop
(triage → test → make → check → PR).

## Steps

1. **Triage** (done): `BUILDABLE`. Feature/enhancement, invariant #5 considered and not at risk.
2. **Spec** (test-author): reconcile the five `.fp-progress` assertions per the spec's test-impact
   table. The behavior-capturing change is `answer-overlay.test.ts:35` → assert `.fp-progress` is
   `null`. Preserve the choice-level XSS coverage. Remove the two obsolete `content.test.ts` render
   tests (202–226) and the single `.fp-progress` line at `content.test.ts:47`. Confirm the suite fails
   on current code for the right reason (banner still present), then lock the tests.
3. **Implement** (maker): minimal change —
   - delete the `.fp-progress` `<div>` from `renderBody()` (`answer-overlay.ts:59`);
   - delete the `.fp-progress` CSS rule from `ANSWER_CSS` (`answer-overlay.ts:226–227`);
   - touch nothing else (leave `position`/`total` machinery vestigial, per spec).
4. **Review** (checker): tests not weakened beyond the test-author's intentional, documented spec
   change; full suite + guards green; no bright line crossed; scope is exactly the banner.
5. **Visual check** (`src/ui/` diff): human-gated. Headless/CI has no dev Chrome — record "visual
   check pending human review" in the PR body; reviewer runs `/verify-overlay` before merge.
6. **PR**: push `loop/issue-19-remove-overlay-banner`, `gh pr create` with `Closes #19`.

## Risk notes

- **Test-count drop is expected and legitimate.** Two `content.test.ts` tests cover the removed banner's
  "Q n of N" rendering; deleting them is the correct spec change, not a maker weakening. The checker
  must distinguish the two — this is called out explicitly in the PR body and the checker brief.
- No CB-fixture, guard-ci, store-guard, manifest, popup-disclaimer, or onboarding/start-panel test
  changes — invariant #5's always-shipped disclaimer stays green and untouched.
