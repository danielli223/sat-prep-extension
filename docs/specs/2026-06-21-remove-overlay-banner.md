# Spec — Remove the answer-overlay taxonomy/position banner (issue #19)

*Last updated: 2026-06-21*

> Decision record for [issue #19](https://github.com/danielli223/sat-prep-extension/issues/19):
> *Reading: remove the "REAL COLLEGE BOARD QUESTION · LIVE, UNALTERED" banner.* A pure UI-chrome
> removal. Touches no bright-line invariant; reaffirms invariant #5 (the always-shipped disclaimer
> lives elsewhere and is unaffected).

## The request

The green banner at the top of our answer overlay — described as *"REAL COLLEGE BOARD QUESTION · LIVE,
UNALTERED"* with a sub-line like *"Form, Structure, and Sense › Hard · Q 6 of 10"* — *"doesn't add much
value, is distracting, and takes up space."* Suggested fix: **remove it.**

## What the banner actually is today

The old `.fp-trust` "REAL COLLEGE BOARD QUESTION · LIVE, UNALTERED" slogan badge is **already gone** —
`answer-overlay.test.ts` already asserts `.fp-trust` is `null` ("no trust badge — the student is on CB
itself"). What remains, and what the issue's screenshot sub-line shows, is the **`.fp-progress`** line
in `renderBody()` (`extension/src/ui/answer-overlay.ts:59`):

```
<div class="fp-progress">${esc(vm.skill)} › ${esc(vm.difficulty)} · Q ${vm.position.index} of ${vm.position.total}</div>
```

The issue explicitly lists the *"… · Q 6 of 10"* content as part of what should go, so the request
reduces to **removing the entire `.fp-progress` banner** (taxonomy *and* position counter), plus its now
-unused CSS rule.

## Bright-line check (invariant #5)

Removing a banner that references College Board *favorably* does **not** weaken the trademark posture.
The mandatory disclaimer (*"Not affiliated with, authorized, or endorsed by College Board; SAT is a
trademark of the College Board."*) lives in the **popup** (`entrypoints/popup.ts`) and the trust line
lives in **onboarding / start-panel** — none of which is the `.fp-progress` element. Invariants #1–#4
and #6 (network, persistence, AI-on-CB, transitions, fail-safe) are untouched: no CB content, network,
or storage surface changes.

## Data-flow consequence (informs scope)

`vm.position` (`{index, total}`) is consumed by **exactly one** call site — the `.fp-progress` banner.
The show-time refresh of `total` (`content.ts:284`, `total = Math.max(total, countLoadedResults(doc),
index + 1)`) exists **solely** to give that banner a correct "Q n of N"; the `practice_started`
telemetry's `resultCount` (`content.ts:269`) is emitted earlier with the *start-time* `total` and does
**not** depend on the show-time refresh.

So once the banner is gone, `vm.position` and the show-time `total` refresh become **vestigial**. To
keep this PR minimal and low-risk we **remove only the rendered banner** (the `.fp-progress` `<div>` and
its CSS) and leave the `position`/`total` machinery in place — ripping it out would cascade into
`view-model.ts`, `view-model.test.ts`, and `content.ts` for no behavioral gain and is out of scope for
"remove the banner."

## Test impact

Five assertions read `.fp-progress` and must be reconciled by the test-author (the maker may not touch
tests):

| File:line | Today | After |
|---|---|---|
| `ui/answer-overlay.test.ts:35` | asserts `.fp-progress` text contains `Q 1 of 10` | **assert `.fp-progress` is `null`** — the behavior-capturing test |
| `ui/answer-overlay.test.ts:216` | asserts escaped taxonomy renders into `.fp-progress` | drop the taxonomy assertion; **keep the choice-text/img XSS assertions** (choices are the remaining untrusted-CB-string boundary) |
| `entrypoints/content.test.ts:47` | asserts `.fp-progress` `Q 1 of 10` inside the attempt-recording test | drop that one line; the attempt-recording assertions stay |
| `entrypoints/content.test.ts:202–212` | dedicated "headers Q n of N" render test | obsolete — tests the removed banner |
| `entrypoints/content.test.ts:214–226` | dedicated "reads N at show time" render test | obsolete — the only observable surface was the banner |

The XSS-escaping coverage for the **still-rendered** untrusted CB strings (choice text / image src /
letter) **must be preserved** — only the taxonomy assertion, whose target is removed, is dropped.

## Out of scope

- Removing `position` from `CardVM`/`toCardVM` or the `total`/`countLoadedResults` logic in `content.ts`.
- Any change to the disclaimer, onboarding trust line, or start-panel.
- Reading or persisting any CB content (no change to the read/score/journal loop).
