# Inline At-a-Glance Stats Widget — Design

*Date: 2026-06-21 · Issue #16 · Status: approved (triage: BUILDABLE, no invariant at risk)*

## Problem

The always-on top-right pill labelled **"📓 Journal"** (`mountPanelToggle`,
`src/entrypoints/content.ts`) has two reported problems (issue #16):

1. **Unintuitive label.** "Journal" doesn't tell a student what's behind it.
2. **It feels like leaving the question flow.** Clicking it overlays the full
   progress panel on top of the question, and — historically — a real click on the
   light-DOM pill bubbled to the document and tripped CB's outside-click close,
   dismissing the open question modal (the 2026-06-18 fix added a `stopPropagation`
   guard; tested at `content.test.ts:613`). The pill is also present *while a question
   is open*, which is exactly when "go to the journal" is most disruptive.

**Suggested fix (verbatim):** "Show the stats in the top right-hand corner until the
user clicks into a question, then hide them — instead of a separate 'Journal'
destination."

## Approach (minimal, compliant)

Replace the cryptic "📓 Journal" launcher with a compact **at-a-glance stats widget**
docked top-right that:

1. **Shows the student's own derived numbers** — done count, accuracy %, day streak —
   the same three fields the panel already shows (`panel.ts:91-95`), from
   `deriveStats(getAttempts(db))` (`stats.ts`). Self-explanatory, so the "Journal"
   label problem is gone: the value is visible without clicking.
2. **Auto-hides whenever a CB question modal is open** and re-shows on the results
   list — the "until the user clicks into a question, then hide them" requirement.
   This also fully resolves the "takes you out of the question" symptom: the widget
   simply isn't present (and can't be clicked) while a question is open.
3. **Keeps the full journal one tap away.** Clicking the widget still opens the
   existing progress panel (`renderPanel` via the unchanged `OPEN_JOURNAL` path), and
   the popup's "Open journal" button is unchanged. *Scope decision:* the issue asks to
   relocate the at-a-glance **stats**, not to delete the journal (weak areas +
   mistakes). Removing that panel would be a regression and is out of scope; instead
   the inline stats become the panel's launcher, so nothing is lost.
4. **Keeps the light-DOM pointer-event guard** (`stopPropagation` on
   pointerdown/mousedown/pointerup/mouseup/click) so a click never reaches CB's
   document-level outside-click handler. Carried over verbatim from `mountPanelToggle`.

## Why no bright line is touched (CLAUDE.md §1–6)

- **§1 read DOM only.** No new network call. Visibility is driven off the same
  `.cb-dialog-container` + "Question ID:" DOM signal `observeQuestions` already keys
  on (`cb/observer.ts:13-14`). The `guard-ci.test.ts` `qbank-api`/`collegeboard.org`
  checks stay green (no new fetch/host literal).
- **§2 persist only IDs + own-data.** The widget renders already-derived `Stats` over
  the student's own `Attempt[]`. Nothing new is persisted; no question text touched.
- **§3 no AI on CB content.** Pure local aggregation; no model anywhere near CB text.
- **§4 user-initiated transitions.** Toggling our own widget's visibility is not a
  question transition — no auto-advance, prefetch, or ID enumeration.
- **§5 nominative trademark.** The widget shows "done / accuracy / day streak" only —
  no SAT/College Board branding, no acorn. Must stay that way.
- **§6 fail-safe.** The widget mounts inside the existing `guardedStart` boot path, so
  the kill-switch / block-detection gate still disables it.

The fragile `src/cb/` layer gains exactly one new, fixture-tested read
(`observeQuestionPresence`) and nothing else.

## CB layer — new signal (`src/cb/observer.ts`)

`observeQuestions` only fires on a question being *shown*; it has no "modal closed /
back on the list" signal, which the widget needs to re-show. Add a sibling:

```ts
// Reports whether CB's question modal is open, and notifies on every transition.
// "Open" = a .cb-dialog-container holding the "Question ID:" heading is present on the
// /digital/results page — the SAME signal observeQuestions keys on. Emits the current
// state synchronously, then fires onChange(open) on each open<->closed transition.
export function observeQuestionPresence(doc: Document, onChange: (open: boolean) => void): () => void
```

- Same results-path + `.cb-dialog-container`/`Question ID:` matcher as `observeQuestions`
  (keep the CB-shape knowledge in one file). No debounce needed — it reports a boolean,
  not a settled view. The worst case is a redundant `onChange(true)` while the modal
  paints, which is idempotent for `setStatsWidgetVisible`.
- Fires the initial state synchronously so the boot can set visibility immediately.
- Returns a `disconnect()` like `observeQuestions`.
- **Fixture-backed test required** (`observer.test.ts`, reusing `multiple-choice.html`):
  reports `false` with no modal, fires `true` when the modal appears, `false` when it's
  removed, and does not fire when off the results path.

## content.ts — rework the launcher

Replace `mountPanelToggle` with three small functions (light-DOM page furniture, same
home as the old launcher; no innerHTML — numbers are set via `textContent`, matching the
badger's injection-proof posture):

```ts
export interface StatsWidgetView { total: number; accuracy: number; streakDays: number; }

// Mount the top-right at-a-glance widget (idempotent). Clicking opens the journal (onOpen).
// Carries the SAME pointer-event stopPropagation guard the old launcher had.
export function mountStatsWidget(doc: Document, onOpen?: () => void): HTMLButtonElement

// Set/refresh the widget's numbers in place (idempotent; no-op if the widget is absent).
export function updateStatsWidget(doc: Document, view: StatsWidgetView): void

// Show/hide the widget. Called with `false` when a question modal is open, `true` on the list.
export function setStatsWidgetVisible(doc: Document, visible: boolean): void
```

- The widget is a `<button class="fp-stats-widget">` with three labelled segments
  (e.g. `12 done`, `75%`, `🔥 3`) plus an `aria-label` like "Open progress journal".
  Numbers go in via `textContent`. `accuracy` is `0..1` → render `Math.round(v*100)%`.
- `updateStatsWidget` finds `.fp-stats-widget` and rewrites its segment text; if the
  widget isn't mounted yet it is a no-op (boot mounts before first update).
- `setStatsWidgetVisible` toggles `style.display` (`''` vs `'none'`).

## content.ts — boot wiring (inside `guardedStart`)

Replace the single `mountPanelToggle(...)` line with:

```ts
const attempts0 = await getAttempts(db);
mountStatsWidget(document, () => void handleMessage(db, { type: OPEN_JOURNAL }));
updateStatsWidget(document, deriveStats(attempts0));          // initial numbers (no empty flash)
observeQuestionPresence(document, (open) => {
  if (open) { setStatsWidgetVisible(document, false); return; }
  // back on the list: refresh the numbers (an attempt may have just been graded) then show
  void getAttempts(db).then((a) => { updateStatsWidget(document, deriveStats(a)); setStatsWidgetVisible(document, true); });
});
watchResultsList(document, db);
chrome.runtime.onMessage.addListener(...);   // unchanged
```

Refreshing the numbers each time the widget re-appears (i.e. each time the student
returns to the list after a question) means the at-a-glance stats are always current
without wiring a second update path into `onCheck`. `deriveStats` returns a superset of
`StatsWidgetView` (`total`, `accuracy`, `streakDays`), so it is passed directly.

## Out of scope / non-goals

- The full journal panel (`renderPanel`: weak areas + mistakes + difficulty filter) is
  unchanged. The popup "Open journal" button is unchanged.
- No persisted state, no telemetry change (the existing `JOURNAL_OPENED` still fires
  from `handleMessage` when the panel opens, now triggered by the widget click).

## UI note

The diff touches `src/ui/`-adjacent rendering (the light-DOM widget in `content.ts`).
Per the issue loop, the PR body must flag that a human run `/verify-overlay` on a real
CB question before merge; in headless CI there is no dev Chrome, so record "visual check
pending human review."

## Testing (TDD)

Deterministic, mock-free where possible.

- `cb/observer.test.ts`: `observeQuestionPresence` initial-`false` / fires `true` on
  modal appear / `false` on removal / silent off the results path (fixture
  `multiple-choice.html`).
- `entrypoints/content.test.ts` (replacing the two `mountPanelToggle` tests):
  - `mountStatsWidget` renders one widget (idempotent), shows the supplied done /
    accuracy% / streak numbers after `updateStatsWidget`, and clicking it calls `onOpen`.
  - pointer-event guard preserved: pointerdown/mousedown/click on the widget never reach
    document listeners, yet `onOpen` still fires (carried-over regression test).
  - `setStatsWidgetVisible(false)` hides, `(true)` shows.
  - integration (no chrome boot needed): mount widget + drive
    `observeQuestionPresence(doc, open => setStatsWidgetVisible(doc, !open))`; inject a
    "Question ID:" modal → widget hidden; remove it → widget shown.
