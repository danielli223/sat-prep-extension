---
name: docs-lint
description: Lint the docs/ knowledge base for staleness and contradictions. Checks docs/index.md rows against the files they point at, flags derived analysis superseded by a newer cb-legal-sources retrieval, surfaces contradictions between derived docs, and verifies "Last updated:"/retrieval dates are honest. Read-only over docs/; produces a findings report and flags contradictions in place. CB-content-free and safe. Invoke for /docs-lint, "lint the docs", "knowledge-base lint", "check docs/index.md is current", or the weekly docs-lint workflow.
---

# docs-lint — knowledge-base lint loop

The periodic lint pass for `docs/`, the project's LLM-maintained wiki. It enforces
the **"Lint (periodic)"** and **"Date stamps"** duties in `CLAUDE.md` →
"The knowledge base (`docs/`)" → "Maintaining it". Read that section before you
start; this skill operationalizes it, it does not replace it.

The goal is a **findings report**, not a silent rewrite. For legal reasoning a
surfaced disagreement is information, not a defect — so contradictions are flagged
**in place** (see "Flagging in place" below), never quietly overwritten.

## Scope and safety

- **Read-only over content.** You read every file under `docs/`. The only writes you
  may make are (a) inserting a visible `<!-- DOCS-LINT: ... -->` flag at the exact
  spot of a contradiction or stale claim, and (b) correcting a provably-wrong
  `Last updated:`/retrieval date to match reality. You do **not** rewrite analysis,
  re-derive conclusions, or resolve a legal disagreement on your own — that is a
  human/attorney call.
- **Never edit raw sources.** `docs/cb-legal-sources/` is immutable (verbatim CB
  terms). Read them to compare retrieval dates; never alter a single character,
  never add a flag inside them. If a raw source looks wrong, report it — do not touch.
- **CB-content-free.** This lint reads only **our own** docs (index, analysis,
  spec/plan headers) and the **metadata** of the raw sources (titles, retrieval
  dates, URLs in headers). You do not need, and must not quote into any model
  prompt, the verbatim CB question/choice/passage/rationale text. The raw legal
  *terms* text in `cb-legal-sources/` is CB copyrighted material too — read it to
  reason about dates and clause references, but keep your report's quotations
  minimal and about *our analysis*, not CB content.

## Bright lines (from `CLAUDE.md` — never cross)

This skill is documentation-only and touches no extension code, but it runs in the
same repo, so it must respect the invariants:

1. **Read the rendered DOM only.** No `qbank-api` / `collegeboard.org` network calls
   from any script you add. This skill makes **no network calls at all** — it works
   purely on files already in the repo.
2. **Persist only `{ question IDs + the student's own data }`.** Never write question
   text/choices/passages/rationales anywhere.
3. **No AI on College Board content, ever.** Never feed a CB question, choice,
   passage, or rationale to a model. (The legal-terms text lives in
   `cb-legal-sources/`; reason over its dates and clause structure, do not pump its
   body into prompts.)
4. **User-initiated transitions only.** N/A here — no prefetch/enumeration.
5. **Nominative trademark use only.** N/A here.
6. **Fail safe.** N/A here.

The only network host allowed anywhere in this repo (besides CB's own page) is
`config.focusedpractice.app`. This skill needs none.

## What "the docs" are

Three layers (see `docs/index.md` → "How this is organized"):

- **Raw sources** — `docs/cb-legal-sources/`. Verbatim CB terms, immutable. Each file
  header carries `Retrieved <date>` + the authoritative URL. The source of truth for
  every legal conclusion.
- **Derived analysis** — the legal, strategy, and customer-voice docs at `docs/*.md`.
  LLM-written; each should cite the raw sources it depends on. Headers carry
  `Last updated:` (and customer-voice docs carry an as-of / "today =" date in their
  italic preamble).
- **Build records** — `docs/specs/` (designs) and `docs/plans/` (plans), dated
  `YYYY-MM-DD-slug.md`.

`docs/index.md` is the catalog: a set of tables, one row per doc, each with a
relative link `[`name`](path)` and a one-line summary.

## The four checks

Run all four every pass. For each finding, record: **severity**
(blocker / warning / nit), **file:line or row**, **what's wrong**, and **suggested
fix** (or "needs human/attorney call" when it's a legal-substance question).

### Check 1 — Stale `docs/index.md` rows

For every row in every table in `docs/index.md`:

1. **Dead/moved link.** Extract the link target. Confirm the file exists at that
   exact path. Flag rows whose target was moved, renamed, or deleted. (A file present
   in `docs/` but absent from the index is the inverse staleness — see step 3.)
2. **Outdated one-liner.** Read the linked doc's title + opening summary. If the
   row's one-liner materially misdescribes the current doc (e.g. claims a verdict the
   doc has since reversed, names a feature/strategy the doc dropped, or describes the
   wrong scope), flag it with the corrected one-liner as the suggested fix.
3. **Missing rows / orphan docs.** List every `*.md` under `docs/` (recursively,
   excluding anything matched by `.gitignore` such as `docs/superpowers/`). Any doc
   not represented by a row is an "orphan" — flag it (an ingest that skipped the
   index-update step). Any row pointing at a non-existent doc is a "dangling" row.
4. **Index freshness.** If you find any orphan/dangling/outdated row, the index's own
   `Last updated:` is suspect — note it (Check 4 will confirm).

Mechanical help (do not depend on it for judgment): list docs and extract link
targets, then diff.

```bash
# from the repo root
find docs -name '*.md' | sort                       # every doc that exists
grep -oE '\]\(([^)]+\.md)\)' docs/index.md          # every link the index points at
```

### Check 2 — Derived analysis superseded by a newer raw retrieval

The legal docs are conclusions *built on* the verbatim terms in
`docs/cb-legal-sources/`. If a raw source was re-retrieved with a newer date than the
analysis that depends on it, that analysis may now rest on superseded terms.

1. Read the `Retrieved <date>` in each `cb-legal-sources/*.md` header (and the
   collective date in `cb-legal-sources/README.md`).
2. Read the `Last updated:` of each derived legal doc
   (`sat-app-legal-architecture.md`, `sat-app-legal-ux-strategies.md`,
   `sat-content-legal-playbook.md`, and any new ones).
3. **Flag any derived legal doc whose `Last updated:` predates the retrieval date of a
   raw source it cites.** That doc has not been re-checked against the current terms.
   Use `CLAUDE.md`'s "Cross-reference legal dependencies" rule: the analysis should
   name the source file/clause it depends on, so trace each named dependency.
4. If a derived doc cites a clause that no longer reads the way the doc paraphrases it
   (the terms text changed under it), that is a **blocker** — surface it in place
   (Check 3's flagging mechanism) and route to a human/attorney; **do not** rewrite
   the legal conclusion yourself.

This check compares **dates and clause references** — it does not require feeding CB
content to any model.

### Check 3 — Contradictions between derived docs

Derived docs can drift apart as the product evolves (e.g. an early doc concluding X
is impossible, a later doc shipping X). The repo's history shows exactly this pattern
(the "scored loop impossible → then shipped" reversal in the UX-strategies doc).

1. Build a short list of the load-bearing claims each derived doc makes (verdicts,
   "we do / never do X", chosen strategy, what's shipped vs. shelved).
2. Cross-compare. Flag pairs of docs that assert **opposing** load-bearing claims
   without one explicitly noting it supersedes the other.
3. Also check derived docs against `CLAUDE.md`'s six bright-line invariants — a doc
   that quietly contradicts an invariant (e.g. implies caching question text, or
   AI-on-CB-content) is a **blocker**.
4. **Flag in place** (below). Do not pick a winner and rewrite the loser — for legal
   reasoning a surfaced disagreement is information. The fix belongs to a human, with
   attorney review for legal substance.

### Check 4 — Dishonest `Last updated:` / retrieval dates

A date that doesn't reflect reality is worse than no date — it manufactures false
confidence.

1. For each derived doc, compare its `Last updated:` header against the file's actual
   last substantive change. Git is the oracle:
   ```bash
   git log -1 --format='%ad' --date=short -- docs/<file>.md
   ```
   If the doc was substantively edited well after its stamped date, the stamp is stale
   — flag it (suggested fix: bump to the real date). If the stamp is *newer* than any
   real change (a stamp bumped without a corresponding edit), flag that too — it's a
   different flavor of dishonest.
   Use judgment with git: a pure typo/format commit is not a "substantive change," and
   the very commit that *fixes* a date will postdate it — don't chase your own tail.
2. For `cb-legal-sources/*.md`, the `Retrieved <date>` must match when that verbatim
   copy was actually captured/committed. These are immutable, so you **report** a
   suspicious retrieval date; you never edit a raw source to "fix" it.
3. For customer-voice docs, sanity-check the in-text as-of dates (e.g. "today =
   2026-06-13", "refresh sweep on 2026-06-17") against each other and the header — an
   internal date contradiction is a finding.
4. `docs/index.md`'s own `Last updated:` should be ≥ the newest change to any doc it
   catalogs; if a doc changed after the index was stamped, the index is stale.

The only dates this skill may auto-correct are provably-wrong `Last updated:` stamps
on **derived** docs (a mechanical fact git can confirm). Everything else is reported.

## Flagging in place (contradictions & superseded claims)

Per `CLAUDE.md`: *"Flag contradictions in-place rather than silently overwriting —
for legal reasoning, a surfaced disagreement is information, not a defect."*

Insert a visible HTML comment at the exact line, so it survives in source and renders
invisibly, without altering the surrounding prose:

```markdown
<!-- DOCS-LINT 2026-06-19: CONTRADICTION — this concludes the scored loop is
     impossible, but sat-app-legal-architecture.md (Last updated 2026-06-14) ships
     it as "R1". One of these must note it supersedes the other. Needs human review;
     do NOT auto-resolve (legal substance). -->
```

Rules for flags:
- Date them and name the conflicting file(s)/clause(s) so the dependency is traceable.
- Use them only for **contradictions** and **superseded-by-newer-retrieval** findings
  that need a human/attorney call. Mechanical fixes (a dead index link, a provably
  stale date stamp) go in the report as suggested edits — and the safe ones may be
  applied directly.
- **Never** place a flag inside `docs/cb-legal-sources/` (immutable).
- Keep the flag terse and CB-content-free. Refer to *which clause / which doc*, not
  the verbatim CB text.

## The findings report

Emit a single report, grouped by severity, then by check. Suggested shape:

```
# docs-lint findings — <date>

## Summary
- N blockers, M warnings, K nits. Scanned X docs + Y raw sources.

## Blockers
- [Check 3] docs/foo.md:120 ⟷ docs/bar.md:45 — contradictory verdicts on Z.
  Flagged in place at both lines. Needs human/attorney review.

## Warnings
- [Check 1] docs/index.md row "baz.md" — link target moved to specs/baz.md.
  Suggested fix: update path + one-liner.
- [Check 2] docs/sat-content-legal-playbook.md (Last updated 2026-06-14) predates
  cb-legal-sources retrieval 2026-06-17 — re-verify against current terms.

## Nits
- [Check 4] docs/index.md Last updated 2026-06-17 but project-brief.md changed
  2026-06-18 — bump the index stamp.

## Actions taken (if any)
- Inserted DOCS-LINT flags at: <file:line>, ...
- Auto-corrected stale date stamps: docs/qux.md 2026-06-10 → 2026-06-15.

## Clean
- No issues found for: <list of checks/docs that passed>.
```

If everything is clean, say so plainly and take no action — a clean lint is a valid,
common outcome.

## When run in CI (the docs-lint workflow)

The workflow runs this skill, then opens a **PR** (for safe mechanical fixes + the
in-place flags) or an **issue** (when the only findings need human/attorney judgment
and there is nothing safe to auto-apply). Title the PR/issue
`docs-lint: <N> findings (<date>)` and paste the report as the body. Never bundle a
legal-conclusion rewrite into that PR — surface, don't resolve.

## Stop signs (you're doing it wrong if…)

- You rewrote a legal conclusion to "resolve" a contradiction. Surface it instead.
- You edited a file under `docs/cb-legal-sources/`. They are immutable.
- You fed CB question/choice/passage/rationale text to a model. Never.
- You bumped a `Last updated:` date without a real change behind it.
- You reported "all clean" without actually listing the docs you checked.
