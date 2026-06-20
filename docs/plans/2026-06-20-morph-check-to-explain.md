# Plan — After Check, morph the button into "Explain" (issue #27)

*Last updated: 2026-06-20*

Implements [`docs/specs/2026-06-20-morph-check-to-explain.md`](../specs/2026-06-20-morph-check-to-explain.md).
Maker/checker pipeline via the issue loop.

## Steps

1. **Failing tests first** (`test-author`), locked before implementation:
   - `src/ui/answer-overlay.test.ts`
     - After `renderVerdict` with a **graded** result: `.fp-check` is hidden
       (`style.display === 'none'`), the `.fp-reveal` control's text is **"Explain"**, and clicking it
       still fires `onReveal`.
     - After `renderVerdict` with an **ungraded** result: same morph.
     - `renderNeedAnswer` does **not** morph: `.fp-check` stays visible, reveal control keeps its
       original label.
     - `renderStaleCard` does **not** morph: same.
   - `src/entrypoints/content.test.ts`
     - End-to-end: pick + Check a gradeable MC question → once the attempt records, `.fp-check` is
       hidden and an **"Explain"** control is shown; clicking it un-hides CB's native `.rationale`
       (the rationale text becomes visible). Locks "Explain" === reveal CB's own content.
   - Keep the two existing pre-check reveal tests green (they click `.fp-reveal` before any Check).

2. **Implement** (`maker`): fold the morph into `renderVerdict` (`src/ui/answer-overlay.ts`) for both
   the graded and ungraded branches — hide `.fp-check`, set the reveal control's label to "Explain"
   and promote its styling to primary. No change to `onReveal`/`revealRationale` wiring; no change to
   `content.ts` required (it already calls `renderVerdict`). Keep `typecheck` + full suite green.

3. **Review** (`checker`): tests not weakened; suite + guards green; no bright line crossed; scope
   tight (no AI/fetch/persistence added; CB-shape knowledge stays in `src/cb/`).

4. **PR**: `Closes #27`, triage verdict, diff summary, raw test counts, checker verdict, and the
   "visual check pending human review" note (UI diff → `/verify-overlay` advised for the human).
