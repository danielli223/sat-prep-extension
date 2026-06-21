# Spec — Unify the built-in calculator with Desmos (issue #17)

*Last updated: 2026-06-21*

> Decision record for [issue #17](https://github.com/danielli223/sat-prep-extension/issues/17):
> *Reading: unify the built-in calculator with Desmos — they're the same tool on the real SAT.*
> Resolves the "unify the calculator with Desmos" follow-up that
> [`2026-06-19-desmos-side-dock.md`](2026-06-19-desmos-side-dock.md) deferred. **Reaffirms — does not
> weaken — the no-iframe / zero-license bright line for Desmos.**

## The request

On the real SAT, the calculator **is** Desmos — students do their arithmetic in the same Desmos tool
the test ships. Our overlay instead exposed **two** affordances side by side: a built-in **"Calculator"**
(a GeoGebra *scientific* calculator embedded in our shadow DOM) **and** a separate **"Open real
Desmos"** button. That is two calculators where the test has one, and it confused students (issue
screenshot: a floating "CALCULATOR" panel next to "Calculator" / "Open real Desmos" buttons). The ask:
*there shouldn't be a separate calculator distinct from Desmos.*

## The constraint that shapes the answer

The naïve reading of "unify" — *render the real Desmos inside the page as the one calculator* — is the
one path we **cannot** take. Per [`sat-app-legal-ux-strategies.md`](../sat-app-legal-ux-strategies.md)
and [`2026-06-19-desmos-side-dock.md`](2026-06-19-desmos-side-dock.md), the build offers the real
Desmos **only as an external window, never an iframe** (the "zero-license fallback", `calculator.ts`
Open item O1 / Decision D7). Iframing desmos.com — or licensing the Desmos API to embed it — reverses
that deliberate "no license needed" decision and would add `frame-src https://www.desmos.com` to the
manifest, which `tests/manifest.test.ts` asserts is **absent**. That variant stays out of scope; it
would need an explicit recorded decision + attorney review (it is the issue's NEEDS_HUMAN sub-question).

## The decision: collapse to one button that opens the real Desmos

We unify by **removing the GeoGebra embed** and collapsing the two buttons into a **single "Calculator"
button that opens the real Desmos** via the existing `openDesmos()` (a side-docked `window.open`, never
an iframe). This is the honest unification:

- **It matches the issue's intent.** There is now one calculator, and it *is* Desmos — the real
  test-day tool, unaltered, on its own free site.
- **It removes the thing students were confused by** (the rival GeoGebra "Calculator"), rather than
  adding a second embedded surface.
- **It is legally *safer*, not riskier.** We delete an embed; we add none. Desmos is still a separate
  window, never embedded. GeoGebra was only ever the *embeddable convenience* option, not a constraint —
  removing it is legally neutral.

### What changes

1. **Answer overlay** (`extension/src/ui/answer-overlay.ts`). The `.fp-calc` block goes from two
   buttons to **one** button labeled **"Calculator"** that invokes the open-Desmos handler. The
   `AnswerHandlers` interface drops `onToggleCalc` (the GeoGebra toggle); the single calculator handler
   remains. `.fp-calc` CSS trims to the one button.
2. **Calculator module** (`extension/src/ui/calculator.ts`). Remove `toggleGeoGebra()` and
   `GEOGEBRA_URL`; keep `openDesmos()` unchanged (still the side-docked `_blank` + `noopener,noreferrer`
   popup). Update the file header — there is no longer an in-page embed.
3. **Wiring** (`extension/src/entrypoints/content.ts`). Drop the `toggleGeoGebra` import and the
   `onToggleCalc` wiring; the single button is wired to `openDesmos()` + the calculator-opened telemetry
   event.
4. **Telemetry** (`extension/src/telemetry/events.ts`). `buildCalculatorOpened`'s `calculatorType`
   narrows from `'geogebra' | 'desmos'` to `'desmos'` — there is only one calculator now. The scrubber's
   `calculator_type` allowance stays (a bounded scalar, no content leak).
5. **Host CSS** (`extension/src/ui/host.ts`). Remove the now-dead `.fp-geogebra*` rules.
6. **Manifest CSP** (`extension/public/manifest*.json`). Drop `frame-src https://www.geogebra.org`
   from the content-security-policy — nothing is embedded anymore. **desmos.com stays absent.**

## Invariants check

- **#1 Read rendered DOM only** — untouched; no CB endpoints.
- **#2 Persist IDs + student data only** — untouched; no storage change.
- **#3 No AI on CB content** — untouched; the calculator never sees CB content.
- **#4 User-initiated transitions** — untouched.
- **#5 Nominative trademark use** — untouched. (Desmos is a separate vendor, not College Board.)
- **#6 Fail safe** — untouched.
- **No-iframe / zero-license for Desmos (Open item O1 / D7)** — **reaffirmed and strengthened.** The one
  embed we *did* have (GeoGebra) is removed; Desmos remains a separate window, never embedded. No new
  frame-src host; desmos.com still absent from the manifest.

## Consequence for the prior decision record

[`2026-06-19-desmos-side-dock.md`](2026-06-19-desmos-side-dock.md) listed "Unify the calculator with
Desmos" as a deferred follow-up needing a product + legal decision. That deferral assumed "unify" meant
*embed Desmos in-page*. This spec resolves it the compliant way — collapse to the external-Desmos link,
no embed — so the follow-up is **done, without the legal escalation**. The "move Open Desmos to the
bottom bar" follow-up remains deferred (separate control-placement change).
