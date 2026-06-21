# Plan — Unify the calculator with Desmos (issue #17)

*Last updated: 2026-06-21*

Implements [`specs/2026-06-21-unify-calculator-desmos.md`](../specs/2026-06-21-unify-calculator-desmos.md):
remove the GeoGebra in-page embed and collapse the two calculator buttons into a single **"Calculator"**
button that opens the real Desmos externally. No iframe, no new manifest host. Driven through the
issue-loop pipeline (test-author → maker → checker).

## Locked test spec (test-author owns ALL test edits)

The test-author writes the failing tests that capture the new behavior **and** updates/removes the
existing tests that encode the old two-tool behavior, so the full suite is green after the maker's
implementation. The maker may not touch tests.

1. **`src/ui/answer-overlay.test.ts`** — the answer overlay renders **exactly one** calculator button,
   visible label **"Calculator"**, and clicking it invokes the open-Desmos handler. There is **no**
   GeoGebra/in-page-embed toggle button and **no** "Open real Desmos" second button. Update the existing
   handler-call-order test (currently expects both `calc` then `desmos`).
2. **`src/ui/calculator.test.ts`** — delete the `toggleGeoGebra` describe block (the embed is gone);
   keep and, if useful, extend the `openDesmos` block. Assert `calculator.ts` no longer exports a
   GeoGebra toggle (e.g. `toggleGeoGebra` is `undefined`).
3. **`src/telemetry/events.test.ts`** — `buildCalculatorOpened` accepts `'desmos'`; the `'geogebra'`
   variant is gone.
4. **`tests/manifest.test.ts`** — the CSP no longer carries `frame-src https://www.geogebra.org`
   (nothing is embedded), and **desmos.com remains absent** from the manifest (keep that assertion — it
   is a bright-line check).

Each new/changed test must fail for the *right reason* against current `main` before implementation.

## Implementation steps (maker)

1. **`src/ui/answer-overlay.ts`** — in `renderBody`, replace the two-button `.fp-calc` block with a
   single "Calculator" button wired to the open-Desmos handler. Remove `onToggleCalc` from
   `AnswerHandlers` and its `wire()` listener. Trim the `.fp-calc` / button CSS to the single control.
2. **`src/ui/calculator.ts`** — remove `toggleGeoGebra()` and `GEOGEBRA_URL`; keep `openDesmos()`
   verbatim. Refresh the file header comment (no in-page embed; the one calculator is the real Desmos).
3. **`src/entrypoints/content.ts`** — drop the `toggleGeoGebra` import and the `onToggleCalc` handler;
   wire the single button to `openDesmos()` + `buildCalculatorOpened({ ..., calculatorType: 'desmos' })`.
4. **`src/telemetry/events.ts`** — narrow `buildCalculatorOpened`'s `calculatorType` to `'desmos'`.
5. **`src/ui/host.ts`** — remove the dead `.fp-geogebra*` CSS rules.
6. **`public/manifest*.json`** (chrome/firefox/edge) — remove `frame-src https://www.geogebra.org` from
   the CSP. Keep everything else; do not add any Desmos host.

## Gates

- `npm run typecheck` clean; `npm test` fully green (incl. `tests/guard-ci.test.ts` and
  `privacy.test.ts`).
- No bright-line invariant crossed (CLAUDE.md §1–6); no `qbank-api`/CB-endpoint reference; no new
  embedded host; desmos.com still absent from the manifest.
- Diff scoped to the files above (+ the docs).

## Visual check (UI diff — `src/ui/`)

The diff touches `src/ui/`, so the reviewer should run **`/verify-overlay`** on a real CB question
before merging (content-free behavioral check only). Headless/CI has no dev Chrome and no human, so the
PR records **"visual check pending human review."**
