---
name: issue-loop
description: Use when asked to autonomously handle a GitHub issue (bug or feature request) end-to-end — triage it against the project's bright-line invariants, write failing tests, implement, independently review, and open a PR. Invoked locally as /issue-loop <n> or in CI when an issue is labeled agent-ready.
---

# Issue Loop

Turn one GitHub issue into a reviewed PR, without crossing a bright line. This is the
SAT-overlay repo's instance of "loop engineering": a maker/checker pipeline with an
invariant-triage gate in front, because here a well-meaning feature request can ask
for something the project legally cannot do.

**Never auto-merge.** A human reviews and merges. The loop's job is to produce a PR
that is *worth* reviewing — green, scoped, invariant-clean — or to stop early and say
why.

## Mode & escalation

The same pipeline runs two ways; the only behavioral difference is how it escalates
when it must stop or is unsure:

- **Interactive** (`/issue-loop <n>` in a session): when in doubt, stop and ask the
  user before proceeding.
- **Headless / CI** (`issue-loop.yml`): no one is there to ask. Escalate instead by
  commenting the reasoning on the issue, applying the `needs-human` label, and
  stopping — never block waiting for input, never guess past a hard stop.

Everything else below is identical in both modes.

## Roles (in `.claude/agents/`)

`issue-triager` → `test-author` → `maker` → `checker`. The test-author and maker are
deliberately different agents: the spec is written by someone who isn't trying to
pass it. The checker is adversarial and independent.

## The pipeline

Run it as a `Workflow` (preferred — gives worktree isolation and structured hand-off)
or step-by-step with the `Agent` tool. Per issue:

0. **Baseline green.** From `extension/`, confirm `npm run typecheck && npm test`
   pass on `main` before mutating anything. If red, stop — fix the baseline first.

1. **Triage gate** (`issue-triager`). Classify and rule on the issue.
   - `BUILDABLE` → continue.
   - `NEEDS_REDESIGN` → continue using the compliant approach the triager named;
     note the redesign in the PR body.
   - `REJECT` / `NEEDS_HUMAN` → STOP. Comment the verdict + reasoning on the issue,
     apply a `needs-human` label, do not write code.

2. **Plan/spec** (for features). Per repo convention, write a dated design in
   `docs/specs/YYYY-MM-DD-slug.md` and a plan in `docs/plans/YYYY-MM-DD-slug.md`
   before coding. Bugs skip straight to the failing test.

3. **Isolate.** Create a worktree + branch `loop/issue-<n>-<slug>`
   (`git worktree add .claude/worktrees/issue-<n> -b loop/issue-<n>-<slug>`), or use
   `isolation: 'worktree'` on the subagents. Never work on `main`.

4. **Spec** (`test-author`). Write the failing test(s); confirm they fail for the
   right reason. Commit them ("test: …") so they're locked before implementation.

5. **Implement** (`maker`). Minimal change to green. May not touch the tests.

6. **Review** (`checker`). Independent audit: tests not weakened, suite + guards
   green, no bright line crossed, scope tight.
   - `REQUEST_CHANGES` → loop back to `maker` with the required changes (cap at ~2
     rounds, then escalate to a human).
   - `APPROVE` → continue.

6.5. **Visual check (UI diffs only, human-gated).** If the diff touches `src/ui/`, the
   overlay's real rendering needs human eyes — note in the PR body that the reviewer
   should run **`/verify-overlay`** (drives the dev Chrome harness on a real CB question)
   before merging. Advisory: it never blocks the pipeline. In headless/CI mode there is
   no dev Chrome and no human, so record "visual check pending human review" instead.
   Never feed CB content to a model — `/verify-overlay` enforces this (the agent runs
   content-free checks only).

7. **PR.** Push the branch; `gh pr create` linked to the issue (`Closes #<n>`). PR
   body: triage verdict, what changed, test evidence (raw counts), the checker's
   verdict, and any redesign. Leave it for human review. **Do not merge.**

8. **Clean up** the worktree after the PR is open
   (`git worktree remove .claude/worktrees/issue-<n>`).

## Hard stops (the loop must refuse, not improvise around)

- Triage = REJECT/NEEDS_HUMAN.
- Baseline not green.
- Checker can't reach APPROVE within the round cap.
- Any bright-line invariant would be crossed (`CLAUDE.md` §1–6). The legal guard
  `extension/tests/guard-ci.test.ts` runs inside `npm test`, so a violation in
  committed code fails the suite — but the triager and checker exist to catch
  intent and design before that.

## Invoking

- **Local:** `/issue-loop <issue-number>` (this skill). Or drive the Workflow in
  `.claude/skills/issue-loop/` directly.
- **CI:** `.github/workflows/issue-loop.yml` runs on `issues: labeled` (`agent-ready`),
  on `workflow_dispatch` (issue input), and a nightly poll. It runs claude-code-action
  with a prompt to follow THIS skill for the target issue.

## Reference Workflow shape

```js
// triage → (stop if not buildable) → spec → make → check → PR
const t = await agent(`Triage issue #${n}`, { agentType: 'issue-triager', schema: TRIAGE })
if (t.verdict !== 'BUILDABLE' && t.verdict !== 'NEEDS_REDESIGN') return { stopped: t }
const spec = await agent(`Write failing tests for #${n}. Approach: ${t.approach}`,
                         { agentType: 'test-author', schema: SPEC, isolation: 'worktree' })
let made = await agent(`Implement #${n} to pass these tests: ${JSON.stringify(spec)}`,
                       { agentType: 'maker', schema: MADE })
let review = await agent(`Review the issue-#${n} branch`, { agentType: 'checker', schema: VERDICT })
// loop maker<->checker up to 2 rounds, then open PR or escalate
```
