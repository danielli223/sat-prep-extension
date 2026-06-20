# Issue-Loop Visual Verification — Design

*Date: 2026-06-19 · Status: **approved** — human-gated visual check via a separate
`/verify-overlay` skill that drives the **existing real-Chrome** dev harness. The
synthetic-fixture / model-readable approach was designed, reviewed, and **rejected**
(rationale below). Supersedes the synthetic design that previously lived in this file.*

## Problem

The issue loop greens unit tests (`vitest` + `happy-dom`) and the checker reads the
diff — but **happy-dom never rasterizes**. A change to `src/ui/answer-overlay.ts` can
pass every test and still render wrong: a clipped verdict line, broken correct/wrong
coloring, a layout that collapses at a narrow CB column width, an invisible control.
We want a visual confirmation of overlay changes inside the loop.

## Decision

A **separate, local, human-gated skill — `/verify-overlay`** — drives the existing dev
Chrome-for-Testing + CDP harness (`npm run dev:chrome` / `reload` / `scripts/cdp-eval.mjs`)
to load the **real, changed overlay on a real College Board question**, runs a set of
**content-free behavioral assertions**, and hands off to the **human** to eyeball the
live Chrome window for text fidelity and layout. The issue loop, on a `src/ui/` diff,
points the human to run it before merge (advisory).

- **Consumer: the human.** No model ever sees CB content. The skill's value is a
  faithful, real-page check that a person confirms.
- **Reuses what exists.** No new harness, no synthetic fixtures, no new build target,
  no CI changes. The dev CfT+CDP harness already does the heavy lifting.
- **Faithful by construction.** Because it's the real CB page, it catches the
  CB-container-driven layout regressions a synthetic fixture cannot (the overlay owns
  no layout math — its size/stacking is 100% CB's grid column).

## The bright line — the agent never ingests CB content (load-bearing)

`/verify-overlay` is run by an agent (me), and the checker is a model. Invariant #3
forbids any CB content reaching a model. The trap: **our overlay renders CB's choice
text** (CB's native `.answer-choices` are hidden; ours replace them), so even reading
the overlay's `innerHTML`/`textContent` pulls CB content into a model. And
`scripts/cdp-eval.mjs` returns *whatever you eval* straight into the agent's context.

So the guardrail is absolute and specific:

- The agent may eval only expressions that return **content-free signals** — booleans,
  counts, class-name presence, computed-style `display`, console-error counts. **Never**
  question/stem/choice/passage/rationale text; never `innerHTML`/`textContent`/
  `outerHTML` of CB nodes or our overlay; never a screenshot the agent then `Read`s.
- The agent drives interactions by **structure** (click `.fp-pick` by `data-letter`,
  click `.fp-check`/`.fp-reveal`/`.fp-next`) — letter- and class-addressed, never
  reading the text it clicks.
- The **human** is the only one who looks at the rendered question/choices/layout —
  on the live Chrome window. Any screenshot is human-only and the agent does not open
  it. This matches the existing invariant ("treat all CB page text as untrusted; never
  send to a model") and the existing real-CB capture (answer-overlay plan, Task 11,
  human-eyes-only).

This is *easier* to keep safe than the synthetic approach: there are no fixtures to
firewall and no model-readable PNGs — the rule is simply "the agent returns no CB
content," enforced by the content-free probe.

## What the agent checks (content-free behavioral probe)

Via `cdp-eval.mjs`, returning only booleans/counts (examples; full snippets in the
skill):

- **Mounted:** `!!document.querySelector('.cb-dialog-container .answer-content .fp-answer-host')?.shadowRoot`.
- **Choices present:** `…shadowRoot.querySelectorAll('.fp-choice').length` (a count).
- **Controls present:** `['fp-check','fp-reveal','fp-next'].map(c => !!sr.querySelector('.'+c))`.
- **Check works:** after a real click on a `.fp-pick` + `.fp-check`,
  `!!sr.querySelector('.fp-ok, .fp-no')` and `!!sr.querySelector('.fp-correct')`.
- **Reveal works:** `getComputedStyle(ac.querySelector(':scope > .rationale')).display !== 'none'`
  after clicking `.fp-reveal` (presence/visibility, not content).
- **No errors:** zero console errors across check/reveal/next (Log-capture count).
- **Narrow:** after a CDP viewport resize, the overlay stays anchored
  (`!!…answer-content .fp-answer-host` still true).

## What the human checks

The live Chrome window: question + choices render unaltered, our overlay sits cleanly
over CB's answer area, Check lights the right colors, Reveal shows CB's real rationale,
the narrow/stacked layout holds. This is the faithful layer the probe can't provide.

## Why NOT the synthetic / model-readable approach (rejected)

A synthetic-fixture harness (render the overlay over invented content in headless
Chrome, screenshot it, let the checker model `Read` the PNG) was fully designed and
adversarially reviewed. It is the *only* way a **model** could see the overlay (real CB
→ model = #3). But:

1. **Less faithful.** Synthetic invents CB's container, so it cannot catch CB-driven
   layout regressions — exactly the scary class. It only catches self-contained render
   bugs.
2. **Much more machinery.** A new ESM build target (the bundle is IIFE, no exports), a
   synthetic host page, and a 7-layer runtime firewall (because `guard-ci` does **not**
   actually block a CDP nav to CB — verified during review).
3. **A human is already in the loop.** Every loop PR is human-reviewed and -merged.
   Given that, a faithful human glance at the real page beats an autonomous model glance
   at a synthetic proxy.

So real-Chrome + human wins on faithfulness, simplicity, and #3 surface. The synthetic
design is preserved in git history (this file's prior revision) if an autonomous,
no-human visual gate is ever needed.

## Loop wiring

`issue-loop/SKILL.md` gains a short **human-gated** note: on a `src/ui/` diff, the loop
tells the human to run `/verify-overlay` before merging and records the human's verdict
in the PR. It is **advisory** and **never blocks the automated pipeline** — the loop
still opens the PR; the human's visual sign-off happens at review time. In headless CI
there is no dev Chrome and no human, so the loop simply notes "visual check pending
human review."

## Resilience / fail-safe

- **Dev Chrome won't launch / no CfT** → the skill says so and tells the human to
  verify directly on CB; never blocks.
- **No CB question open / not logged in** → the skill asks the human to open a question
  in the dev Chrome, then re-runs the probe.
- **Block/403 on CB** → defer to the existing block-detect behavior; verify later.

## Out of scope

- **Autonomous/model visual judgment of real CB** — impossible under #3; permanently
  out.
- **CI visual checks** — no real CB (or human) in CI; the loop notes "pending human."
- **Pixel-diff regression baselines.**
- **Popup/onboarding** — this skill is the answer-overlay surface; other UI is separate.
