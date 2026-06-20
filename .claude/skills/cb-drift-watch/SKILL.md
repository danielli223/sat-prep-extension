---
name: cb-drift-watch
description: Use to detect and respond to drift in College Board's question-bank DOM (the fragile src/cb/ layer). Runs a maintainer-side live heartbeat (dev Chrome + structure-only fingerprint probe), compares against the last-good fingerprint, and on a mismatch drives a maker/checker pipeline to repair src/cb/ and open a PR. Invoked as /cb-drift-watch.
---

# CB DOM-Drift Watchdog (the flagship loop)

CB owns the HTML our extension reads. When they reship their markup — rename
`.cb-dialog-container`, drop `.answer-choices`, swap `table.cb-table-react` — the
fragile `src/cb/` layer silently stops reading questions and the whole overlay
degrades. This loop is how we **notice the break early** and **repair it without ever
crossing a bright line**.

The break has a structural signature, and that signature is the ONLY thing that ever
leaves the page: a **content-free fingerprint** — booleans (does the structure exist?)
and counts (how many?), never any question/choice/passage/rationale text, never even a
bare question id. Built deterministically by `src/cb/fingerprint.ts` (unit-tested) and
restated for the live page by `scripts/probe-fingerprint.js`.

## CORE RULE — only the fingerprint reaches a model (invariant #3 / #2)

Live CB DOM flows **only through deterministic code** — `fingerprint.ts` and
`scripts/probe-fingerprint.js`. The single thing an agent (or any log, diff, or PR) is
allowed to see from the live page is the **structural fingerprint**: booleans, counts,
selector NAMES. **Never** CB question, choice, passage, or rationale text; never the
bare 8-hex id. `reader.ts` reads text — that stays in RAM and is never logged, never
shown to the checker, never put in a PR. If you cannot answer a question about the
drift from booleans + counts alone, the answer is: a human looks at the live page.

## Why the heartbeat is maintainer-side, NOT in CI

The drift probe runs on a **maintainer's machine against a CB tab they are signed into
and already viewing** — never in CI. Two reasons:

1. **CI can't drive the bank.** The runner has no signed-in CB session and no dev
   Chrome; there is nothing to probe.
2. **Automated traversal would itself be a violation.** Invariant #4 forbids prefetch,
   enumeration, and auto-advance; a bot clicking through questions to sample DOM is
   exactly the "volume = scraping" behavior we must never do. The probe is read-only on
   **whatever the human already opened** — it never navigates, never enumerates ids,
   never advances.

So: deterministic `fingerprint.ts` unit tests gate CI (they run in `npm test`); the
**live** probe is a manual heartbeat the maintainer runs, like `/verify-overlay`.

## Heartbeat (manual, periodic)

From `extension/`, with the latest build loaded and a real question (or the results
list) open in the dev Chrome:

```bash
cd extension && npm run build && npm run dev:chrome && npm run reload
# human opens a real question OR the results list in that dev Chrome, then:
npm run drift:probe          # == npm run cdp -- --file scripts/probe-fingerprint.js
```

This prints the structure-only fingerprint as JSON (`question` and/or `list`,
whichever is rendered). Compare it field-by-field against the **last-good** block in
`docs/cb-contract-status.md`.

## Drift signals (any one is a tripwire)

- **Live probe mismatch vs last-good.** A boolean flipped or a count changed against
  the recorded baseline. The canonical flips:
  - `hasDialogContainer` → false (CB renamed the dialog container)
  - `answerChoiceCount` → 0 on an MC question (`.answer-choices` renamed/removed)
  - `hasTaxonomyTable` → false (`table.cb-table` renamed)
  - `hasQuestionId` → false (header lost the "Question ID" token)
  - `hasResultsTable` → false / `idBearingRowCount` → 0 (`table.cb-table-react` renamed)
  - `taxonomyDataCellCount` ≠ 5 (taxonomy columns added/removed)
  (`hasRationale` false is EXPECTED pre-reveal — only a signal if the probe was run on
  a revealed question that was good before.)
- **`checkContract` failures in the field** (`src/resilience/contract-check.ts`): a
  read returning `unreadable` / `missing-id` / `no-answerable-content`.
- **`bumpFailureCounter` climbing** (the persisted `contract.failureCount`): the
  in-product canary that CB's DOM stopped reading. A rising count is the strongest
  real-user signal and should trigger a heartbeat even off the periodic schedule.

Record EVERY heartbeat (drift or clean) as a dated row in
`docs/cb-contract-status.md` — content-free only.

## On drift — the repair pipeline (maker/checker, human-gated)

Never auto-merge `src/cb/`. The fragile layer is exactly where a wrong fix silently
mis-scores students. A human reviews and merges.

1. **Isolate.** New worktree + branch
   `git worktree add .claude/worktrees/cb-drift-<date> -b loop/cb-drift-<date>`.

2. **Maker repairs `src/cb/`.** Update the selector(s) that drifted in `reader.ts` /
   `list-reader.ts` / `observer.ts` — and `fingerprint.ts` + `scripts/probe-fingerprint.js`
   in lockstep (they share the selector set; the probe header says KEEP IN SYNC). The
   maker works from the **fingerprint diff** (which boolean flipped), not from CB text.

3. **A DIFFERENT agent authors the new fixture.** Per the TDD playbook, the fixture +
   test author is not the implementer. The new/updated fixture in
   `src/cb/__fixtures__/` is **SYNTHETIC** — fabricated structure that mirrors CB's new
   markup, every text node marked `[SYNTHETIC]`. **Never** paste real CB content into a
   fixture (invariants #2/#3). The fixture encodes the NEW shape so the unit tests and
   `fingerprint.test.ts` lock the repaired contract.

4. **Checker verifies — deterministic AND live.**
   - `cd extension && npm run typecheck && npm test` (the suite includes
     `fingerprint.test.ts`, the readers' tests, and the legal guard
     `tests/guard-ci.test.ts` — all must be green).
   - Re-run the **live probe** (`npm run drift:probe`) on a real question and confirm
     the fingerprint now matches the NEW expected shape. The checker reads booleans +
     counts only.
   - Confirm no bright line crossed: no `qbank-api`/`collegeboard.org` network call, no
     CB text in any fixture/log/PR, fixtures are `[SYNTHETIC]`.

5. **PR.** `gh pr create` with: which selector drifted, the before/after fingerprint
   diff (content-free), the test evidence (raw counts), and the live-probe match.
   **NEVER auto-merge `src/cb/`** — leave it for human review.

6. **On merge, update the baseline.** Replace the last-good block in
   `docs/cb-contract-status.md` with the new fingerprint and log the repair.

## Hard stops (refuse, don't improvise)

- Any temptation to put CB text in a fixture, a log, the PR, or the checker's context —
  STOP. Fingerprints are booleans + counts only.
- Any temptation to make the probe **navigate or enumerate** to "sample more" — STOP
  (invariant #4). The probe reads only what the human already opened.
- Baseline suite not green, or the live probe still mismatches after the fix — STOP;
  do not open the PR.
- Auto-merging a `src/cb/` change — never.

## Files

- `extension/src/cb/fingerprint.ts` — deterministic structure-only projection (unit-tested).
- `extension/src/cb/fingerprint.test.ts` — locks the content-free + drift contract.
- `extension/scripts/probe-fingerprint.js` — live-page restatement (KEEP IN SYNC).
- `extension/src/resilience/contract-check.ts` — `checkContract` + `bumpFailureCounter` signals.
- `docs/cb-contract-status.md` — last-good fingerprint + dated heartbeat log (content-free).
