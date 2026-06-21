# Remove the Start-Panel Reassurance Banner — Design

*Date: 2026-06-21 · Issue #21 · Status: approved (triage: BUILDABLE, no invariant at risk)*

## Problem

The overlay's start panel renders a blue "reassurance banner" (`.fp-onboarding`):

> "These are College Board's own questions, served live from collegeboard.org. We
> never rewrite them, never run them through AI, and never store them — only your
> answers and progress."

Issue #21 (from the "SAT Prep Tool — Feedback & Fixes" doc) judges this product-trust
copy as unnecessary clutter on the start screen and asks to remove it.

## Why no bright line is touched

This banner is **product-reassurance copy, not the §5 affiliation disclaimer**. The
legally-required disclaimer — *"Not affiliated with, authorized, or endorsed by
College Board; SAT is a trademark of the College Board."* — is rendered independently
and survives untouched at:

- `extension/src/entrypoints/popup.ts` (the `.fp-notice` `<p>` in the toolbar popup,
  guarded by `popup.test.ts`),
- `extension/manifest.json` / `manifest.firefox.json` / `manifest.edge.json`
  (store `description`),
- `extension/PRIVACY.md` (guarded by `privacy.test.ts`).

The banner shares **none** of the §5 disclaimer language, so removing it leaves the
disclaimer fully prominent (#5 intact). No network call (#1), no persistence change
(#2), no model (#3), no question transition (#4), no kill-switch/branding change (#6).
The fragile `src/cb/` layer is untouched and no CB question content is read or handled.

## Scope (precise)

- `extension/src/ui/start-panel.ts` — remove the `<div class="fp-onboarding">…</div>`.
- `extension/src/ui/host.ts` — remove the now-orphaned `.fp-onboarding{…}` CSS rule.
- `extension/src/ui/start-panel.test.ts` — invert the line-14 assertion to lock the
  removal: `.fp-onboarding` must now be **absent** from the rendered start panel.

## Out of scope

`extension/src/entrypoints/onboarding.ts` (`TRUST_LINE`) carries similar text but is a
one-time `console.log` (consumed at `background.ts`), invisible to the user and not the
screenshotted banner. It and `onboarding.test.ts` stay untouched — their staying green
is part of the proof that only the visible start-panel banner changed.
