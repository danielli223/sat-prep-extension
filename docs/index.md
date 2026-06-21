# docs/ — Knowledge Base Index

> Catalog of the project's accumulated knowledge. Read this first when a question
> needs background; it points to the right doc instead of re-deriving from scratch.
> Update it on every ingest (new row + one-line summary).
>
> *Last updated: 2026-06-19*

## How this is organized

Three layers, following the project's wiki convention:

- **Raw sources** — `cb-legal-sources/`. Verbatim College Board terms. Immutable:
  read, never edit. The source of truth for every legal conclusion.
- **Derived analysis** — the legal, strategy, and customer-voice docs. LLM-written;
  each cites the raw sources it depends on.
- **Build records** — `specs/` (designs) and `plans/` (implementation plans).

`../CLAUDE.md` holds the project invariants and codebase map.

## Orientation

| Doc | What it is |
|---|---|
| [`project-brief.md`](project-brief.md) | One-page brief: the product, the core legal principle, v1 feature set, tech stack, bright-line guardrails, status. Start here. |

## Legal — derived analysis

| Doc | What it is |
|---|---|
| [`sat-app-legal-architecture.md`](sat-app-legal-architecture.md) | **Authoritative legal+build spec** for the shipped client-side overlay ("R1"). Verdict: there is a legal way to build this; questions live and die on CB's page, the app is the scoring layer. Based on hands-on QB testing (2026-06-14) + an adversarially-verified research pass. |
| [`sat-app-legal-ux-strategies.md`](sat-app-legal-ux-strategies.md) | Strategy menu for delivering the loved UX with real CB questions. Documents the reframe ("be the UX layer; let CB deliver the questions"), the hands-on QB findings, and why the scored overlay (Strategy A) was chosen over alternatives B–F. |
| [`sat-content-legal-playbook.md`](sat-content-legal-playbook.md) | Content/copyright/AI rules for the *authored-content* path and the AI guardrails both paths share. Bottom line: never redistribute, modify, or AI-feed real CB items; the three legal layers are copyright, CB's terms, and trademark. |

## Legal — raw primary sources (`cb-legal-sources/`)

Verbatim CB terms, retrieved 2026-06-17, authoritative URL in each file's header.

| Doc | What it governs |
|---|---|
| [`cb-legal-sources/README.md`](cb-legal-sources/README.md) | Manifest of the primary sources: what each file governs and which legal question it is most relevant to. |
| [`cb-legal-sources/sat-suite-program-agreement.md`](cb-legal-sources/sat-suite-program-agreement.md) | The Question Bank **license** — "classroom teaching and internal reporting only," no right to display/enhance. The single most on-point clause for the re-display question. |
| [`cb-legal-sources/college-board-site-terms.md`](cb-legal-sources/college-board-site-terms.md) | Site-wide **copyright** (§8) + **non-commercial-use-only** (§10) + no scrape/data-mine. The copyright basis that needs no assent. |
| [`cb-legal-sources/college-board-trademark-guidelines.md`](cb-legal-sources/college-board-trademark-guidelines.md) | Nominative/fair use of marks, required non-affiliation disclaimer, acorn-logo ban, generative-AI prohibition. |
| [`cb-legal-sources/college-board-copyright-permission-instructions.md`](cb-legal-sources/college-board-copyright-permission-instructions.md) | Reproduction policy + the narrow noncommercial-educational carve-out (which does not apply to a commercial overlay). |

## Customer-voice research

| Doc | What it is |
|---|---|
| [`oneprep-customer-voice-synthesis.md`](oneprep-customer-voice-synthesis.md) | What SAT students actually feel about OnePrep and the gap its changes opened. Bottom line: the loved thing was a *bundle* (real official questions + better-than-CB UX + free) pulled apart at once; AI-question switch stings serious students most, paywall triggers the loudest venting; a large share of positive signal is manufactured. |
| [`oneprep-customer-voice-evidence.md`](oneprep-customer-voice-evidence.md) | The traceable evidence ledger behind the synthesis — verbatim quotes, coverage map (34 r/SAT threads + App Store/Trustpilot/TikTok/HN), and representativeness signals. |

## Build records

| Doc | What it is |
|---|---|
| [`specs/2026-06-17-answer-area-overlay-design.md`](specs/2026-06-17-answer-area-overlay-design.md) | Design: stop re-rendering CB's question; mount our interaction over CB's `.answer-content` and let CB render stem/choices/rationale natively (kills a class of fidelity bugs). Approved, full replacement. |
| [`plans/2026-06-17-answer-area-overlay.md`](plans/2026-06-17-answer-area-overlay.md) | Implementation plan for the answer-area overlay: the new `answer-overlay` module, reader changes (drop `stemHtml`/`explanationHtml` + sanitizer), and task-by-task steps. |
| [`specs/2026-06-19-loop-visual-verification-design.md`](specs/2026-06-19-loop-visual-verification-design.md) | Design — **approved: human-gated `/verify-overlay` skill** driving the existing dev Chrome+CDP harness to verify the overlay on a **real** CB question; the agent runs only **content-free** checks (booleans/counts), the human eyeballs the live window — so no CB content ever reaches a model (invariant #3). Synthetic / model-readable approach designed, reviewed, and **rejected** (less faithful, much more machinery; a human already reviews every PR). |
| [`plans/2026-06-19-loop-visual-verification.md`](plans/2026-06-19-loop-visual-verification.md) | Implementation plan (real-Chrome, human-gated): the `/verify-overlay` skill + issue-loop step 6.5 are written (no new code — reuses `dev:chrome`/`reload`/`cdp-eval`); remaining is one live verification pass to validate the probe selectors against the real overlay. |
| [`specs/2026-06-19-desmos-side-dock.md`](specs/2026-06-19-desmos-side-dock.md) | Decision (issue #37): dock the calculator to the side of the screen — full-height GeoGebra panel in-page, and "Open real Desmos" as a screen-edge window. **Reaffirms** the no-iframe / zero-license Desmos line; defers "unify with Desmos" and "move to bottom bar". |
| [`specs/2026-06-20-notes-below-explanation-design.md`](specs/2026-06-20-notes-below-explanation-design.md) | Design (issue #22): move the "Why did you miss it?" note + Calculator/Desmos controls **below** CB's answer explanation by splitting the overlay into two Shadow hosts (interaction first, extras appended last so CB's native `.rationale` sits between). Pure UI reposition of our own controls — no bright line (note is student-own data; CB content never read/stored/sent). Supersedes the issue's original "remove the note" ask. |
| [`plans/2026-06-20-notes-below-explanation.md`](plans/2026-06-20-notes-below-explanation.md) | Implementation plan for the two-host split: tests-first (DOM-order/masking-exemption/teardown), `answer-overlay.ts` changes only (+ its test), keep masking/observer/reveal/teardown invariants green. |
