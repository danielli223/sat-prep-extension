# Plan — "Seen before" indicator (issue #28)

> Spec: `docs/specs/2026-06-21-seen-before-indicator.md`
> Last updated: 2026-06-21

Maker/checker pipeline via the issue loop. Triage verdict: **BUILDABLE** (feature;
crosses no bright line — read-only over the student's own attempt journal).

## Steps

1. **Test (locked first).**
   - `src/ui/view-model.test.ts`: `toCardVM(view, i, n, 'missed')` sets
     `vm.priorStatus === 'missed'`; omitting the arg defaults to `'new'`; stem never
     leaks into the VM.
   - `src/ui/answer-overlay.test.ts`: mount with `priorStatus` of `new`/`done`/`missed`
     → `.fp-seen[data-prior]` carries the status and the matching fixed label; no stem
     text in the shadow.
   - `src/entrypoints/content.test.ts`: pre-seed a missed attempt for `ab12cd34`, run
     the loop, open the `mc` fixture → overlay shows the "missed" badge; with no seed,
     a never-seen question shows "New to you".

2. **Implement (minimal to green).**
   - `view-model.ts`: add `priorStatus` to `CardVM`; 4th param on `toCardVM`
     (default `'new'`).
   - `answer-overlay.ts`: `SEEN_LABEL` map + `.fp-seen` node in `renderBody`; CSS.
   - `content.ts`: snapshot `getSeen(db)` once in `runLoop`; pass status to `toCardVM`
     in `showQuestion`.

3. **Review (checker):** tests not weakened, full suite + guards green, no bright line
   crossed, scope tight (no new persisted field, no CB text path).

4. **Visual check:** the diff touches `src/ui/` — flag `/verify-overlay` for the human
   reviewer (no dev Chrome in CI → record "visual check pending human review").

## Invariant guardrails to hold

- No new persisted field; the indicator is a pure read over `getAttempts`/`deriveStats`.
- Badge text is a fixed 3-value label map — never a CB-derived string.
- No CB endpoint / enumeration / prefetch; ID comes from the already-rendered modal.
