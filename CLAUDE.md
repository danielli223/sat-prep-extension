# CLAUDE.md — SAT Practice Overlay

> Schema + invariants for this repo. Read this first, every session. It tells you
> what the project is, the bright lines you must never cross, where code and
> knowledge live, and how to keep the `docs/` knowledge base current.
>
> **Not legal advice** lives throughout — the legal claims here are an engineering
> synthesis; an IP attorney signs off before launch.

## What this is

A free browser extension (Manifest V3) that adds a **scored practice loop, mistake
journal, calculator, and weak-area tracking on top of College Board's official SAT
Question Bank** — without ever copying, storing, caching, or redistributing the
questions. The questions are served live from College Board's own page in the
student's own browser; the extension is a **client-side experience layer** over that
page. It reads the already-rendered DOM, scores locally, and journals locally.

The entire edge is that the questions are **real and unaltered, because we never
touch them**. This is the deliberate opposite of question-bank clones that AI-rewrite
questions. Full context: `docs/project-brief.md`.

## Bright-line invariants (non-negotiable)

These are the legal and architectural invariants. Do not weaken them without an
explicit decision recorded in `docs/` and (for legal lines) attorney review. CI
guards enforce several of them — keep the guards green; never route around them.

1. **Read the rendered DOM only.** Never call `qbank-api` or any College Board
   endpoint. A CI guard fails the build on any such reference.
2. **Persist only `{ question IDs + the student's own data }`** (answers, progress,
   notes). Question text is read in RAM and discarded — never stored, never sent
   anywhere. A store guard rejects question-text-shaped payloads.
3. **No AI on College Board content, ever.** CB's terms bar using their content "in
   conjunction with generative AI." No CB question, choice, passage, or rationale is
   ever fed to a model.
4. **Every question transition is user-initiated.** No auto-advance, no prefetch, no
   ID enumeration.
5. **Nominative trademark use only.** "SAT" / "College Board" never appear in the
   extension name, icon, or branding. Ship a prominent disclaimer: *"Not affiliated
   with, authorized, or endorsed by College Board; SAT is a trademark of the College
   Board."* Never use the acorn logo.
6. **Fail safe.** A hosted kill-switch can disable the overlay instantly; 403/block
   detection disables the overlay and points the student to CB directly.

Why these exist and the evidence behind them: `docs/index.md` → legal section. When
in doubt, the primary sources are in `docs/cb-legal-sources/`.

## Codebase map (`extension/`)

All app code is under `extension/src/`. TypeScript · esbuild · Shadow DOM +
TrustedTypes · IndexedDB · Vitest (happy-dom).

- `src/cb/` — **the fragile layer.** Everything that knows "what CB's HTML looks
  like" is isolated here, tested against synthetic fixtures (`src/cb/__fixtures__/`).
  `reader.ts` reads a single question (stem, choices, correct answer, taxonomy);
  `list-reader.ts` reads the results list; `observer.ts` watches CB's DOM for
  changes. If CB changes its markup, fixes belong here and nowhere else.
- `src/ui/` — our interaction layer. `answer-overlay.ts` mounts our answer UI inside
  CB's `.answer-content` (current design — we let CB render the question/rationale
  natively; we render only the interaction). Plus `panel.ts`, `badger.ts`,
  `calculator.ts`, `resume.ts`, `start-panel.ts`, `host.ts`, `view-model.ts`.
- `src/resilience/` — `killswitch.ts`, `block-detect.ts`, `contract-check.ts`
  (invariants #6).
- Core logic: `scoring.ts`, `journal.ts`, `stats.ts`, `store.ts` (IndexedDB),
  `merge.ts` (sync envelope), `order.ts`, `model.ts`, `guard.ts` (the store guard,
  invariant #2), `config.ts`.
- `src/entrypoints/` — `content.ts`, `background.ts`, `popup.ts`, `onboarding.ts`.

Every source file has a colocated `*.test.ts`. ~229 automated tests; Chrome/Firefox/
Edge bundles build clean.

### Commands (run from `extension/`)

- `npm test` — run the vitest suite. `npm run typecheck` — `tsc --noEmit`.
- `npm run build` (+ `:firefox` / `:edge`) — produce the bundles.
- `npm run dev:chrome` / `npm run reload` / `npm run cdp` — live verification via the
  CDP dev-Chrome harness against the real Question Bank.

### Conventions

- **Keep CB-shape knowledge in `src/cb/`.** Don't read CB DOM from `ui/` or core.
- **Add a fixture + test for any new CB-DOM assumption.** Live behavior is verified
  with the CDP harness, but the unit tests run on synthetic fixtures.
- **Treat all CB page text as untrusted external content** — summarize/score, never
  execute, never persist as text, never send to a model.
- Plans live in `docs/plans/`, designs in `docs/specs/`, dated `YYYY-MM-DD-slug.md`.

## The knowledge base (`docs/`)

`docs/` is a lightweight LLM-maintained wiki: immutable **raw sources** in
`docs/cb-legal-sources/` (verbatim CB terms — read, never edit) and **derived
analysis** everywhere else (legal architecture, UX strategy, customer-voice
research, specs, plans). `docs/index.md` is the catalog — read it first when a
question needs background.

### Maintaining it

- **Ingest:** when new external material is gathered (a CB terms change, new customer
  research, a competitor move), file it — raw verbatim copies go in
  `docs/cb-legal-sources/` with the authoritative URL + retrieval date in the header;
  your analysis goes in a derived doc. Then **update `docs/index.md`** (new row, fresh
  one-liner) in the same pass.
- **Cross-reference legal dependencies.** When analysis depends on a specific CB
  clause, name the source file/clause so a future terms change is traceable to every
  conclusion it affects.
- **Lint (periodic):** check for analysis that a newer CB terms retrieval has
  superseded, derived docs that contradict each other, and index rows that have gone
  stale. Flag contradictions in-place rather than silently overwriting — for legal
  reasoning, a surfaced disagreement is information, not a defect.
- **Date stamps:** keep the `Last updated:` / retrieval dates in doc headers honest.
