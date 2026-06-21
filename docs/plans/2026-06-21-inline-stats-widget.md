# Inline At-a-Glance Stats Widget — Implementation Plan

> **For agentic workers:** TDD. Failing test first, watch it fail for the right
> reason, then minimal code. Run all `npm`/`vitest` commands from `extension/`.

**Goal:** replace the cryptic always-on "📓 Journal" pill with a compact top-right
at-a-glance stats widget (done / accuracy% / day-streak) that auto-hides while a CB
question modal is open and re-shows on the results list, while still opening the full
journal on click. Pure rendering of the student's own derived stats + a DOM-presence
toggle — no CB read beyond the existing modal signal, no network, no AI, no persisted
shape change.

**Reference:** `docs/specs/2026-06-21-inline-stats-widget-design.md`.

---

## Task 1: Failing CB-layer test — `observeQuestionPresence`

**Files:** modify `src/cb/observer.test.ts`

- [ ] Add tests for a new `observeQuestionPresence(doc, onChange)`:
  - on the `/digital/results` path with no modal, the first `onChange` call is `false`.
  - injecting the `multiple-choice.html` fixture (a `.cb-dialog-container` with
    "Question ID:") fires `onChange(true)`.
  - removing the modal (`document.body.innerHTML = ''`) fires `onChange(false)`.
  - off the results path (`/digital/search`), it does not report `true` for the modal.
- [ ] Run `npx vitest run src/cb/observer.test.ts` — confirm FAIL (export missing), not
  a typo.

## Task 2: Implement `observeQuestionPresence`

**Files:** modify `src/cb/observer.ts`

- [ ] Add the exported function. Reuse the SAME matcher as `observeQuestions`
  (`/digital/results` path guard + `.cb-dialog-container` holding `/Question ID:/i`).
  Compute `isOpen()` as a boolean; fire `onChange(isOpen())` synchronously; install a
  `MutationObserver` on `doc.body` (childList+subtree) that fires `onChange(now)` only
  when the boolean flips. Return `disconnect`.
- [ ] Run `npx vitest run src/cb/observer.test.ts` — confirm PASS.

## Task 3: Failing content tests — the widget (replace the toggle tests)

**Files:** modify `src/entrypoints/content.test.ts`

- [ ] Replace the two `mountPanelToggle` tests (`:607` idempotency, `:613` pointer
  guard) and the import (`:581`) with tests for the new API:
  - `mountStatsWidget(document)` adds exactly one `.fp-stats-widget` (idempotent on a
    second call).
  - after `updateStatsWidget(document, { total: 12, accuracy: 0.75, streakDays: 3 })`,
    the widget text contains `12`, `75%`, and `3` (the done / accuracy / streak values).
  - clicking the widget calls the `onOpen` passed to `mountStatsWidget`.
  - **pointer guard preserved** (carry over the `:613` regression): pointerdown /
    mousedown / click dispatched on the widget never reach document-level listeners, yet
    `onOpen` still fires exactly once.
  - `setStatsWidgetVisible(document, false)` sets the widget hidden
    (`style.display === 'none'`); `(document, true)` shows it.
  - integration (no chrome boot): `mountStatsWidget` + drive
    `observeQuestionPresence(document, open => setStatsWidgetVisible(document, !open))`;
    inject the MC fixture → widget hidden; clear it → widget shown again.
- [ ] Run `npx vitest run src/entrypoints/content.test.ts` — confirm FAIL.

## Task 4: Implement the widget + boot wiring

**Files:** modify `src/entrypoints/content.ts`

- [ ] Replace `mountPanelToggle` with:
  - `export interface StatsWidgetView { total: number; accuracy: number; streakDays: number; }`
  - `mountStatsWidget(doc, onOpen?)`: idempotent (`return` existing `.fp-stats-widget`),
    a `<button class="fp-stats-widget">` docked top-right (reuse the old pill's fixed
    positioning / z-index / shadow), an `aria-label` like "Open progress journal", three
    labelled segment spans, the SAME pointer-event `stopPropagation` loop, and a
    `click → onOpen` binding. Returns the button.
  - `updateStatsWidget(doc, view)`: locate `.fp-stats-widget`; if absent, no-op;
    else set each segment's `textContent` (done count, `Math.round(accuracy*100)%`,
    streak). No innerHTML.
  - `setStatsWidgetVisible(doc, visible)`: toggle `style.display` on `.fp-stats-widget`.
- [ ] Update the boot block (`guardedStart` runner): replace the `mountPanelToggle(...)`
  line with the mount + initial `updateStatsWidget(deriveStats(await getAttempts(db)))`
  + `observeQuestionPresence(...)` wiring from the spec (hide on open; on close refresh
  numbers then show). Keep `watchResultsList` and the `onMessage` listener unchanged.
- [ ] Add minimal `fp-stats-widget` inline styling (the widget is light DOM; style
  inline like the old pill and the badger chips). Keep it visually a small pill.
- [ ] Run `npx vitest run src/entrypoints/content.test.ts` — confirm PASS.

## Task 5: Full green + build + verify

**Files:** none beyond the above (check nothing else imported `mountPanelToggle`)

- [ ] `npx vitest run && npx tsc --noEmit && npm run build` — all green, `tsc` exits 0,
  chrome bundle builds. (Optional `:firefox` / `:edge`.)
- [ ] Confirm `tests/guard-ci.test.ts` stays green (no new fetch/CB host literal).
- [ ] Visual check is human-gated: the PR body flags `/verify-overlay` on a real CB
  question before merge. In headless CI: record "visual check pending human review".
