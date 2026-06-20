# CB DOM-Contract Status — drift watchdog state

> *Last updated: 2026-06-19*
>
> External state for the CB DOM-drift watchdog loop (`.claude/skills/cb-drift-watch/SKILL.md`).
> Holds the **last-good structural fingerprint** of College Board's question-bank DOM
> plus a dated log of every heartbeat run. This file is the baseline the live probe
> (`extension/scripts/probe-fingerprint.js`, `npm run drift:probe`) is diffed against.
>
> **Content-free, always.** Everything here is **structure only** — booleans (does a
> structure exist?), counts (how many?), and selector NAMES. It carries NO question /
> choice / passage / rationale text and NO bare 8-hex question id (invariant #3 / #2).
> Recording anything else here is a bright-line violation. Built deterministically by
> `extension/src/cb/fingerprint.ts` (the only thing safe to log/diff).

## What "drift" means

The fingerprint mirrors exactly the selectors `reader.ts` / `list-reader.ts` depend on.
When CB reships their markup, a boolean flips or a count changes against the last-good
baseline below — that mismatch is the tripwire. See the SKILL for the canonical flips
and the maker/checker repair pipeline.

## Last-good fingerprint (baseline)

> Update this block ONLY when a `src/cb/` repair PR has merged and a fresh live probe
> confirms the new shape. Until the first live heartbeat is recorded, the values below
> are the **expected** shape derived from the synthetic fixtures (`fingerprint.test.ts`),
> NOT a captured live reading — marked as a placeholder.

- **Status:** PLACEHOLDER (no live heartbeat captured yet — values are the fixture-derived expectation)
- **Confirmed against live CB:** _not yet_
- **Schema version of `fingerprint.ts` SELECTORS:** initial (2026-06-19)

### Single question (`fingerprint`)

| Field | Expected (good) | Meaning |
|---|---|---|
| `hasDialogContainer` | `true` | root IS `.cb-dialog-container` |
| `hasHeaderH4` | `true` | header `<h4>` present |
| `hasQuestionId` | `true` | `<h4>` carries a "Question ID: ……" 8-hex token (token only — id never recorded) |
| `hasTaxonomyTable` | `true` | `table.cb-table` present |
| `taxonomyDataCellCount` | `5` | data-row `<td>`s: Assessment, Section, Domain, Skill, Difficulty |
| `hasStemNode` | `true` | `.question-content` stem container present |
| `answerChoiceCount` | `4` (MC / image-choice), `0` (grid-in) | `.answer-choices ul > li` count |
| `hasRationale` | `true` post-reveal, `false` pre-reveal | `.rationale` present (pre-reveal false is expected, not drift) |

### Results list (`fingerprintList`)

| Field | Expected (good) | Meaning |
|---|---|---|
| `hasResultsTable` | `true` | `table.cb-table-react` reachable |
| `bodyRowCount` | (varies — current page size) | all `tbody tr` (includes any loading row) |
| `idBearingRowCount` | (== number of loaded result rows) | rows whose `.id-column` holds an 8-hex id (count only) |

## Heartbeat log (content-free)

> One row per `npm run drift:probe` run (drift or clean). Record only booleans / counts
> / the verdict — never page text or ids. On drift, link the repair PR once opened.

| Date | Surface probed | Result | Field that changed (if any) | Action |
|---|---|---|---|---|
| 2026-06-19 | — | baseline placeholder created | — | none — first live heartbeat pending |
