---
name: verify-overlay
description: Use to visually verify a change to the answer overlay (src/ui/) on a REAL College Board question, locally, via the dev Chrome-for-Testing + CDP harness. The agent runs only content-free behavioral checks; a human eyeballs the live window. Invoked as /verify-overlay, and referenced by the issue loop on src/ui/ diffs.
---

# Verify Overlay (local, human-gated)

Confirm that a change to `src/ui/answer-overlay.ts` (or the overlay's CSS/handlers)
renders and behaves correctly **on a real CB question** — the faithful check that
happy-dom unit tests can't give you, because the overlay owns no layout math (its
size/stacking is CB's grid column). The agent drives the existing dev harness and
reports content-free signals; **the human looks at the actual rendered page.**

## BRIGHT LINE — the agent never ingests CB content (invariant #3)

The checker is a model, and our overlay **renders CB's choice text** (CB's native
choices are hidden; ours replace them). `scripts/cdp-eval.mjs` returns *whatever you
eval* into the agent's context. Therefore, when running this skill, the agent MUST:

- Eval only expressions returning **booleans / counts / class presence / computed
  `display` / error counts**. NEVER `innerHTML`/`textContent`/`outerHTML` of any CB
  node or our overlay; NEVER question/stem/choice/passage/rationale text.
- Drive interactions by **structure** — click `.fp-pick` (by `data-letter`),
  `.fp-check`, `.fp-reveal`, `.fp-next` — never reading the text it clicks.

The human is the only one who looks at the question, choices, rationale, and layout.

## Prerequisites

From `extension/`, with the latest build loaded:

```bash
cd extension && npm run build && npm run dev:chrome && npm run reload
```

Expected: `✓ dev Chrome up …` and `✓ reloaded`. Then the **human** opens a real
question in that dev Chrome (from the Question Bank results list). The harness only
works against a CB tab the human is signed into; if none is open, ask the human to open
one.

## Steps

1. **Confirm a question + overlay are live** (content-free):
   ```bash
   node scripts/cdp-eval.mjs "(() => {
     const ac = document.querySelector('.cb-dialog-container .answer-content');
     const sr = ac && ac.querySelector('.fp-answer-host') && ac.querySelector('.fp-answer-host').shadowRoot;
     if (!sr) return { mounted: false };
     return { mounted: true,
       choices: sr.querySelectorAll('.fp-choice').length,
       hasCheck: !!sr.querySelector('.fp-check'),
       hasReveal: !!sr.querySelector('.fp-reveal'),
       hasNext: !!sr.querySelector('.fp-next') };
   })()"
   ```
   `mounted:false` → ask the human to open a question, then re-run.

2. **Exercise Check** (real clicks on our own buttons; returns only booleans):
   ```bash
   node scripts/cdp-eval.mjs "(() => {
     const sr = document.querySelector('.fp-answer-host').shadowRoot;
     sr.querySelector('.fp-choice .fp-pick').click();   // pick the first choice (no text read)
     sr.querySelector('.fp-check').click();
     return { verdict: !!sr.querySelector('.fp-ok, .fp-no'),
              correctLit: !!sr.querySelector('.fp-correct'),
              wrongLit: !!sr.querySelector('.fp-wrong') };
   })()"
   ```
   (Real `.click()` on our overlay buttons fires our handlers — see
   [[cb-react-isolated-world-reveal]] for why property-sets on CB's React inputs are
   different; our buttons are fine.)

3. **Exercise Reveal** (visibility of CB's native rationale, not its content):
   ```bash
   node scripts/cdp-eval.mjs "(() => {
     const sr = document.querySelector('.fp-answer-host').shadowRoot;
     sr.querySelector('.fp-reveal').click();
     const ac = document.querySelector('.answer-content');
     const r = ac.querySelector(':scope > .rationale');
     return { rationaleShown: r ? getComputedStyle(r).display !== 'none' : null };
   })()"
   ```

4. **Narrow layout holds** — resize the dev Chrome narrow (or via CDP
   `Emulation.setDeviceMetricsOverride`) and re-run step 1's probe; `mounted` must stay
   true (the overlay follows CB's stacked column).

5. **Console clean** — confirm no errors were logged across check/reveal/next (use the
   harness Log-capture pattern; report the **count**, not message text if any could
   echo CB content).

6. **Human visual sign-off (required).** Ask the human to look at the live dev-Chrome
   window and confirm: the question + choices render unaltered, our overlay sits cleanly
   over the answer area, Check lights the correct/wrong colors, Reveal shows CB's real
   rationale, and the narrow/stacked layout looks right. **This is the verdict** — the
   probe only corroborates.

## Report

Summarize the content-free probe results (mounted ✓, N choices, verdict/colors ✓,
rationale shown ✓, narrow ✓, 0 console errors) **and** the human's visual verdict.
Never include CB question/choice/rationale text in the report.

## Relationship to the issue loop

The issue loop (`.claude/skills/issue-loop/SKILL.md`) references this skill on a
`src/ui/` diff: it tells the human to run `/verify-overlay` before merging and records
the verdict in the PR. It is **advisory** — it never blocks the automated pipeline, and
in headless CI (no dev Chrome, no human) the loop notes "visual check pending human
review."
