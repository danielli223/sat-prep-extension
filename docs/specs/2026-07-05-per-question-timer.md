# Per-question timer

Date: 2026-07-05
Status: implemented (branch `feature/per-question-timer`)

## What

A live elapsed-time clock in the answer overlay, showing how long the student has
been on the *current* question. Resets to 0 when a genuinely different question
becomes active. The elapsed time at the moment of the first Check is also stamped
onto that question's attempt record (`Attempt.timeSpentMs`, optional, ms).

## Why

User request: "add a clock that keeps track of how long the person spent per
question... if the user goes to the next question it resets."

## Design

**Clock state** lives in `content.ts`'s `runLoop` closure as a single
`currentQuestionId` / `questionStartMs` pair — not a `Map<questionId, startMs>`.
`showQuestion(view)` resets the anchor only when `view.id !== currentQuestionId`.
This means:
- CB's known detach/reattach quirk (repeat `showQuestion` calls for the *same*
  open question) leaves the clock running, not reset.
- Navigating to a genuinely different question resets it.
- Revisiting an earlier question (e.g. via the nav grid) also resets it — a
  deliberate choice: "time spent on this pass through the question," not "time
  since it was first ever opened including everything spent elsewhere since."

**Live display — revised (2026-07-05, same day): lives in CB's own header row,
not our card.** First cut rendered a `.fp-timer` span inside our shadow-DOM
overlay card. The user asked instead for it centered in CB's native
"Question ID: ..." header strip, bigger, matching that row's visual weight. This
is a real (small) scope change: our stated architecture
(`docs/specs/2026-06-17-answer-area-overlay-design.md`) mounts our UI only inside
`.answer-content`; the header lives outside it, in CB's own chrome. Precedent
already exists for simple furniture injected outside our hosts (the top-right
stats widget, a plain light-DOM button appended to `document.body`), so this
follows that posture rather than inventing a new one:

- `mountQuestionHeaderTimer`/`unmountQuestionHeaderTimer` (`answer-overlay.ts`)
  mount a plain `<span>` (no shadow root) into the modal's header row, found via
  a new bank-agnostic `QUESTION_HEADER_SELECTOR` (`cb/observer.ts`, mirroring the
  existing `QUESTION_MODAL_SELECTOR`): educator `.cb-dialog-header` vs. student
  `.cb-modal-header > .question-modal-header` — same two-child (h4 + button)
  shape underneath in both banks. Verified live via the content-free CDP harness
  before implementing (classnames/computed-layout only, never text — invariant
  #3), not just from the fixtures (which shape one specific affordance — a
  "Copy" button — not the close-button variant the live modal actually shows;
  both are legitimate CB surfaces, not fixture drift).
- Positioned `absolute; left:50%; transform:translate(-50%,-50%)` with
  `pointer-events:none`, so it's out of the header's flex flow entirely — never
  touches the h4's or close-button's own layout, and can't intercept clicks
  meant for CB's close button. `header.style.position` is set to `relative` only
  if not already positioned (marked via `data-fp-header-positioned` so teardown
  restores exactly that and never clobbers a pre-existing CB style).
- Ticks by mutating the badge's Text node `.data` directly (`characterData`),
  **never** `.textContent =`. This element lives in the page's light DOM, inside
  the subtree two body-wide `MutationObserver`s already watch
  (`observeQuestions`'s 150ms-settle debounce and `observeQuestionPresence`) —
  `.textContent =` always replaces the Text node (a `childList` mutation), which
  at 1 Hz would repeatedly re-trigger `observeQuestions`' debounce for as long as
  the clock runs. `characterData` mutations aren't in either observer's config,
  so this sidesteps the problem entirely rather than tolerating the churn.
- content.ts drives both mount/unmount alongside the existing overlay mount and
  `teardownOverlay` (same lifecycle, since both need to reset together) —
  `mountQuestionHeaderTimer`/`unmountQuestionHeaderTimer` aren't called from
  inside `mountAnswerOverlay`/`unmountAnswerOverlay` because their target (the
  modal's header) is a different element than `.answer-content`.
- The interval is a single module-level id, same reasoning as the original
  design: only one overlay is ever live, and an interval (unlike a
  `MutationObserver`) keeps firing even after its container detaches, so a
  WeakMap keyed on a since-detached header would leak a running timer.

The clock keeps ticking after Check is pressed — it shows "time since this
question opened," not "time spent before answering." The persisted
`timeSpentMs` is the frozen snapshot at first grade; the two are allowed to
diverge on purpose.

`CardVM.startedAtMs` (the first cut's plumbing) was removed — the anchor now
flows directly from `content.ts`'s `questionStartMs` into
`mountQuestionHeaderTimer`, never through the view-model.

**Resets on exit, not just on question change.** `currentQuestionId` also resets
to `null` at every overlay teardown (`teardownOverlay`, wrapping
`unmountAnswerOverlay` + `unmountQuestionHeaderTimer`) — the student's own ✕
close, `onNext`'s no-next-available fallbacks, and the DOM-contract degrade path.
Without this, closing a question and reopening the *same* one later would resume
the old elapsed time instead of starting fresh, since `currentQuestionId` would
still equal that question's id. CB's own detach/reattach re-render of the SAME
still-open question never calls `teardownOverlay`, so the clock keeps running
uninterrupted through that quirk, same as before.

**Persistence**: `onCheck` snapshots `timeSpentMs = Math.max(0, Date.now() -
questionStartMs)` synchronously, at the same point `firstGrade` is claimed —
*before* the `awaitCorrectAnswer` await. A different question's `showQuestion` can
fire during that await (CB re-rendering) and reset `questionStartMs`; reading it
after the await would silently record garbage. `timeSpentMs` covers only
first-shown-to-first-Check (re-checks after changing an answer don't update it,
matching `firstGrade`'s existing "record once" semantics).

`Attempt.timeSpentMs` and `NewAttempt.timeSpentMs` are optional (old records have
none). `guard.ts`'s `ALLOWED_KEYS` allowlist gained `timeSpentMs` — required, or
`recordAttempt` throws (the legal invariant that only IDs + student data persist).
No `DB_VERSION` bump needed (additive optional field on an existing store).

## Explicitly out of scope

No `stats.ts` aggregation (no average-time-per-skill surfacing) — raw storage +
live display only. No pause/freeze of the display when a modal loses focus or the
tab backgrounds (accepted v1 limitation: backgrounding inflates the displayed
clock and, if Check is pressed while backgrounded, `timeSpentMs`).
