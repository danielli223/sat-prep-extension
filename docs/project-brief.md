# Project Brief — SAT Practice Overlay (browser extension)

*Last updated: 2026-06-16*

## One-liner
A free browser extension that adds a scored practice loop, a mistake journal, a calculator, and weak-area tracking **on top of College Board's official SAT Question Bank** — without ever copying, storing, caching, or redistributing the questions.

## The core principle (and the legal invariant)
The official questions are **served live from College Board's own page in the student's own browser**. The extension is a **client-side experience layer** over that page — it reads the already-rendered DOM, scores locally, and journals locally. The only things that ever persist are **question IDs + the student's own data** (answers, progress, notes). Question text is read in RAM and discarded; it is never stored, never sent anywhere, and never run through AI.

This is the deliberate opposite of question-bank clones that AI-rewrite questions: our entire edge is that the questions are unmistakably **real and unaltered**, because we never touch them.

## How it works
1. The student filters and searches on College Board's own Question Bank form (we never touch CB's controls).
2. On the results page, the extension offers **Start focused practice** (list order or randomized) over a dimmed CB page.
3. Per question, a **focus card** spotlights CB's live question with our answer UI: select, cross-off choices, an explicit **Check**, instant red/green scored against CB's own answer (read from the rendered DOM), CB's own explanation revealed in place, and a one-line "why did you miss it?" note.
4. Each result is recorded locally; previously-seen questions are **badged** (✓ done / ⚠ missed / new) when they reappear in CB's list.
5. A separate **journal/progress panel** shows done/accuracy/streak, worst-first weak areas, and the mistakes list.

## Feature set (v1)
- Scored answer-and-score loop (multiple-choice + grid-in), never-guess fallback (no verdict shown if an answer can't be read confidently).
- Mistake journal + weak-area tracking + guided resume.
- Re-surface badger over CB's results list.
- Integrated **GeoGebra** calculator + one-click **Open real Desmos** (the free test-day tool).
- Randomize within loaded results.
- Local-only, no accounts, free. (The data model carries a sync envelope so accounts/cloud sync can be added later with no migration.)

## Tech
Manifest V3 · TypeScript · esbuild · Shadow DOM + TrustedHTML · IndexedDB · Vitest (happy-dom). Packaged for Chrome, Firefox, and Edge. All fragile "what CB's HTML looks like" knowledge is isolated in a small DOM-reader layer with synthetic-fixture tests.

## Legal guardrails (bright lines)
- Read the **rendered DOM only**; never call `qbank-api` or any College Board endpoint. A CI guard fails the build on any such reference.
- Persist **only** `{ question IDs + the student's own data }`; a store guard rejects question-text-shaped payloads.
- Every question transition is user-initiated — no auto-advance, no prefetch, no ID enumeration.
- **No AI** on College Board content, ever.
- Nominative use only: "SAT" / "College Board" never in the extension name, icon, or branding, with a prominent **"Not affiliated with, authorized, or endorsed by College Board; SAT is a trademark of the College Board"** notice.
- A hosted **kill-switch** can disable the overlay instantly; 403/block detection disables and points the student to CB directly.

> Not legal advice — have an IP attorney review before launch. See the design spec and the legal architecture in `docs/` for the full rationale.

## Status
Implemented across four plans (foundation, scored loop, journal/badger/resume, resilience/packaging), reviewed and live-validated against the real Question Bank. ~229 automated tests; chrome/firefox/edge bundles build clean.
