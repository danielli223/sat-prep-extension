# Issue-Loop Visual Verification — Implementation Plan (real-Chrome, human-gated)

> **Scope:** the deliverable is a thin local skill, **`/verify-overlay`**, that drives
> the **existing** dev Chrome-for-Testing + CDP harness to verify the answer overlay on
> a real CB question, with a human eyeballing the live window. No new harness, no
> synthetic fixtures, no build target, no CI changes. The synthetic / model-readable
> approach was rejected (see the spec). Revised 2026-06-19 after the consumer decision
> (human + real Chrome).

**Reference:** Design spec at `docs/specs/2026-06-19-loop-visual-verification-design.md`.

## What's already built

- `/.claude/skills/verify-overlay/SKILL.md` — the skill: prerequisites, the **bright-line
  #3 guardrail** (the agent evals only content-free signals; the human looks at CB
  content), the content-free probe commands (mounted / choices / Check colors / Reveal
  visibility / narrow / console), and the human sign-off.
- `.claude/skills/issue-loop/SKILL.md` — new **step 6.5** (human-gated, advisory):
  on a `src/ui/` diff, the PR tells the reviewer to run `/verify-overlay` before merge.

No code changes — it reuses `npm run dev:chrome` / `reload` / `scripts/cdp-eval.mjs`.

## Remaining: one live verification pass (do once, to validate the probe)

- [ ] **Step 1: Bring up the harness.** `cd extension && npm run build && npm run
  dev:chrome && npm run reload`. Open a real question in the dev Chrome.
- [ ] **Step 2: Run the skill's probes** (the four `cdp-eval.mjs` snippets in
  `verify-overlay/SKILL.md`) and confirm each returns the expected booleans/counts
  against a real question: `mounted:true`, `choices` ≥ 2, `verdict`/`correctLit` after
  Check, `rationaleShown:true` after Reveal, still `mounted` when narrow.
- [ ] **Step 3: Confirm the #3 guardrail holds in practice** — verify every probe used
  returns only booleans/counts (no CB text reaches the transcript). If any snippet would
  surface CB content, fix the snippet in the skill before relying on it.
- [ ] **Step 4: Human visual sign-off** — confirm the live window looks right (text
  unaltered, overlay anchored, colors, rationale, narrow layout).
- [ ] **Step 5:** If any probe selector is wrong against the live overlay (class names
  drift from `answer-overlay.ts`), correct the snippets in `verify-overlay/SKILL.md`.
  No commit of capture output — there is none.

## Notes

- **Nothing to git-ignore** — the skill produces no files (no PNGs, no fixtures).
- **CI** is untouched; `issue-loop.yml` unchanged. The loop's step 6.5 degrades to
  "visual check pending human review" in headless CI by design.
- **If an autonomous (no-human) visual gate is ever needed**, the rejected
  synthetic-fixture design (with its ESM build target + 7-layer #3 firewall) is in this
  file's git history and the spec's "Why NOT the synthetic approach" section.
