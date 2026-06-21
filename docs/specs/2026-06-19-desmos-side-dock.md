# Spec — Dock the calculator to the side of the screen (issue #37)

*Last updated: 2026-06-19*

> Decision record for [issue #37](https://github.com/danielli223/sat-prep-extension/issues/37):
> *Math: "Open real Desmos" should dock Desmos to the side of the screen.* Reaffirms — does not
> weaken — the no-iframe / zero-license bright line for Desmos.

## The request

Make the calculator **dock to the side of the screen** (rather than floating), like College Board's
Math UI, which docks its Desmos calculator full-height to the left of the question. The issue names the
**"Open real Desmos"** button and lists two related ideas: *unify the calculator with Desmos* and *move
"Open Desmos" to the bottom bar*.

## The constraint that shapes the answer

"Open real Desmos" is the **zero-license fallback** (`calculator.ts`, Open item O1). Per
[`sat-app-legal-ux-strategies.md`](../sat-app-legal-ux-strategies.md): the build embeds **GeoGebra**
(which permits embedding) and offers the **real Desmos as an external link, _not_ an iframe**, to avoid
Desmos's embedding terms. So we **cannot** put the real desmos.com *inside* the page as a docked panel
without crossing that legal line — doing so would require either iframing desmos.com (against the
zero-license intent) or licensing the Desmos API (reverses the deliberate "no license needed"
decision). Either would need an explicit recorded decision + attorney review and is **out of scope**
here.

Given that, docking is implemented two ways, each respecting every bright-line invariant:

1. **In-page calculator (GeoGebra, freely embeddable).** The `.fp-geogebra` panel changes from a
   floating bottom-left box to a **full-height panel docked to the left edge** — the in-page
   "docked, not floating" experience the screenshot shows. Left (not right) so it never collides with
   the right-docked `.fp-panel` journal. *(`extension/src/ui/host.ts`.)*
2. **"Open real Desmos" (external site, never iframed).** `openDesmos()` now opens desmos.com as a
   **tall, narrow window flush to the screen's right edge** (`window.open` with `popup` +
   `width/height/left/top`) instead of a default floating window — the closest honest match to
   side-docking for a site we don't embed. Still `_blank` + `noopener,noreferrer` (preserves the
   named-target re-navigation fix, live 2026-06-16). *(`extension/src/ui/calculator.ts`.)*

## Invariants check

- **#1 Read rendered DOM only** — untouched; no CB endpoints.
- **#2 Persist IDs + student data only** — untouched; no storage change.
- **#3 No AI on CB content** — untouched.
- **#4 User-initiated transitions** — untouched.
- **#5 Nominative trademark use** — untouched.
- **No-iframe / zero-license for Desmos (Open item O1)** — **reaffirmed.** Desmos is still a separate
  window, never embedded.

## Deferred follow-ups (the issue's "related" items)

- **Unify the calculator with Desmos.** Would require an in-page real-Desmos surface → the Desmos API
  (license) or an iframe (blocked). Needs a product + legal decision before it can be built. Not done.
- **Move "Open Desmos" to the bottom bar.** A larger control-placement change touching the answer
  overlay's action layout; deferred to keep this change focused. **Picked up in [issue #29](https://github.com/danielli223/sat-prep-extension/issues/29)** — see
  [`2026-06-21-desmos-action-bar.md`](2026-06-21-desmos-action-bar.md).

## Visuals

- `assets/2026-06-19-desmos-side-dock/calculator-floating-vs-docked.svg` — in-page calculator
  before/after.
- `assets/2026-06-19-desmos-side-dock/open-real-desmos-floating-vs-docked.svg` — external Desmos
  window before/after.
- `assets/2026-06-19-desmos-side-dock/preview.html` — self-contained preview built from the shipped
  CSS; open in any browser.
