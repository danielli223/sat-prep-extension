# Answer-Area Overlay — Design

*Date: 2026-06-17 · Status: approved (brainstorm), pending implementation plan*

## Problem

The current overlay is a centered modal card that **re-renders College Board's
question** (stem, choices, explanation) into our own DOM. Re-rendering CB content
is the source of an entire class of fidelity bugs this caused — tables flattened
to text, a `MathDifficulty:` label leak, MathJax rendering — each needing bespoke
sanitizer/spotlight code. CB itself renders all of that perfectly.

CB's question modal has a stable two-region layout: a `.question-content` region
(the stem) and a `.answer-content` region (choices + rationale), laid out
side-by-side on wide viewports and stacked on narrow ones (Bootstrap-style grid).

## Decision summary

Stop re-rendering CB's content. **Let CB render the question and its rationale;
we render only the interaction**, mounted over CB's answer region.

- **Rollout:** full replacement — the answer-area overlay becomes *the* design.
  The centered card and the stem/explanation re-render paths are removed. No card
  fallback; instead the overlay degrades to a no-op if it can't anchor.
- **Stem:** CB-native. We never render it.
- **Choices:** ours (interactive: cross-off, select, instant red/green). CB's
  native `.answer-choices` are hidden.
- **Explanation:** CB-native. On Reveal we un-hide CB's own `.rationale` rather
  than re-rendering it — so the `explanationHtml` sanitizer/renderer is also removed.

## Architecture — Approach A: inject into `.answer-content`

Mount one shadow-isolated host **as a child of CB's `.answer-content`**. CB's own
layout then positions, sizes, and scrolls our UI for free — responsive with zero
rect-tracking. (Rejected Approach B: a `document.body`-level floating layer that
tracks the container's bounding rect via resize/scroll/mutation observers — fully
decoupled but we own all the position math, and it can lag/jitter.)

The re-mount cost of living inside CB's DOM is cheap because our observer already
fires on every question change.

### Components (inside our shadow root)

- **Header strip:** trust badge ("Real CB question · unaltered"), "Q n of N",
  calculator toggle.
- **Choices:** A–D, interactive (cross-off + select + instant red/green on Check).
- **Actions:** Check / Reveal / Next.
- **Verdict line** and the **mistake-note** field.

CB's question (left/top) is never touched. The calculator stays the existing
floating GeoGebra panel, toggled from the header.

## What gets removed

- The centered modal card (dimmed backdrop + `fp-card` layout).
- Stem re-render: `stemHtml`, `readStemHtml`/`sanitizeStemHtml`, `.fp-stem`.
- Explanation re-render: `explanationHtml`, `readExplanationHtml`,
  `explanationHtmlGetter`.
- The allowlist sanitizer (`sanitizeInto`, `STEM_TAGS`/`DROP_TAGS`/`MATH_TAGS`,
  `KEEP_ATTRS`) is deleted — its only consumers are `readStemHtml` and
  `readExplanationHtml`, both removed.
- `QuestionView` **keeps** the plain `stem` text — the observer's dedup signature
  (`observeQuestions`) keys on it — and **drops** `stemHtml` and `explanationHtml`.

## Data flow

Unchanged upstream: `observeQuestions` detects the modal and emits a
`QuestionView` (id, taxonomy, choice text, `correctAnswer`); scoring still reads
CB's correct answer from the DOM. The only change is the **sink**: instead of
`mountHost(body)` + a centered `renderCard`, we mount into `.answer-content`, hide
CB's native `.answer-choices`, and render our UI there.

## Reveal behavior

We still trigger CB's reveal (`ensureAnswerRevealed`) so its `.rationale` lands in
the DOM. Our "Reveal" button then **un-hides CB's native `.rationale`** (kept hidden
until then). No re-rendering, no sanitizing.

## Resilience (no card fallback)

- **`.answer-content` not found / un-anchorable** → don't mount. CB's native page
  stands; no crash. A single console note for diagnostics.
- **CB wipes `.answer-content` on its in-place "Next"** → our host is destroyed with
  it. The observer already fires on that swap, so we **re-mount idempotently** every
  time a question is shown.

## Isolation & clicks

- Open shadow root + the existing TrustedTypes policy → CB's CSS can't reach in,
  ours can't leak, even nested inside CB's container.
- Our host sits inside CB's modal region, so clicks won't trip CB's outside-click
  close; we keep `stopPropagation` as belt-and-suspenders.

## Testing (TDD)

happy-dom tests against an `.answer-content` fixture:

- CB's native `.answer-choices` hidden; our choices rendered.
- Reveal un-hides CB's `.rationale`.
- Idempotent re-mount when `.answer-content` is replaced (CB "Next").
- Scoring intact (reads `correctAnswer` from the DOM).
- Graceful no-op when `.answer-content` is absent.

Then live Chrome-for-Testing verification across real question types.

## De-risking spike (first implementation step)

Before the full build, validate on a **real** CB question:

1. Does CB wipe `.answer-content` on its in-place "Next"? (drives the re-mount design)
2. Does shadow isolation hold nested inside CB's container?
3. Do clicks inside our host stay clear of CB's outside-click close?

## Out of scope / open

- Mobile (extensions are desktop-first; unchanged by this design).
- Whether to keep a small "open this question on CB" affordance in the header
  (decide during implementation; low-risk either way).
