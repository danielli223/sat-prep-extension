# Randomize (loaded results) — Design

*Date: 2026-06-21 · Issue #31 · Status: triage NEEDS_REDESIGN (invariants #1 & #4 in play; compliant guided approach below)*

## Problem

The Start panel offers **"Randomize (loaded results)"**. Choosing it currently has
**no visible effect**: the questions appear in CB's list order, identical to
"Start in list order". The button "does nothing" (issue #31).

## Root cause

`start('random')` mints a non-zero `shuffleSeed` and persists `orderMode: 'random'`
(`src/entrypoints/content.ts`), but **nothing consumes that order for forward
navigation**. The student moves question→question via our overlay's Next, which calls
`onNext` → `clickCbNext` — and `clickCbNext` actuates **CB's own in-modal "Next"**,
which advances in CB's *list* order. The seeded `shuffleIds` permutation
(`src/order.ts`) is only ever rebuilt at **resume** time (`planResume` /
`scrollToResume` in `src/ui/resume.ts`) to position the scroll — it never drives the
sequence the student sees. So "random" and "list" produce the same on-screen order;
only the persisted seed differs.

## Why this is a redesign, not a one-liner (bright lines #1 & #4)

The naive "fix" — have the extension pick the next shuffled question id and **load
it** through CB (e.g. drive CB to open a specific non-adjacent question) — would cross
two bright lines:

- **#4 (every transition user-initiated; no auto-advance, no prefetch, no ID
  enumeration):** the extension choosing and opening the next specific question is
  auto-advance / extension-driven navigation.
- **#1 (read the rendered DOM only; never navigate CB by id):** driving CB to a chosen
  id is exactly the id-navigation the bright lines forbid.

So we do **not** auto-open questions. Instead we reuse the project's already-blessed
**guided** posture (the Resume model, spec D9 / contract §2.3): the extension reads the
*already-rendered* result rows, computes the deterministic shuffled order over those
rows, and **scrolls the next row into view for the student to click**. The student
performs every transition; the extension never loads a question, never calls an API,
never enumerates ids. This is the same compliance envelope as `scrollToResume`.

## The design — guided shuffle navigation (random mode only)

The shuffled order is the deterministic `shuffleIds(loadedIds, seed)` over the IDs of
the **currently-loaded** results (read via `readListQuestionIds`, the frozen
list-reader). Random mode follows that order by *guiding* (scrolling), never loading.

1. **Seed up front + guided start.** `start('random')` mints the seed immediately
   (rather than lazily in the first-question observer), so the order exists before the
   student opens anything. If the results list is on the page, scroll the **first**
   id of the shuffled order into view, so the student begins from a randomized
   question by clicking that row. (List not yet rendered ⇒ no-op, exactly like
   Resume.) The persisted session keeps `orderMode: 'random'` + this `shuffleSeed`, so
   journaling/stats/telemetry are unchanged.

2. **Guided Next (random mode).** On the student's Next, advance the position in the
   shuffled order, tear our overlay down (restoring CB's masked nodes — the existing
   `unmountAnswerOverlay` teardown, so the student returns to the loaded list), and
   **scroll the next shuffled row into view** for them to click. Do **not** call
   `clickCbNext` in random mode (that yields list order). When the position runs past
   the end of the order, just tear down (no next), same end-state as today's last-item
   fallback.

3. **List mode unchanged.** `onNext` in `orderMode: 'list'` keeps the smooth in-modal
   `clickCbNext` behavior. No existing list-mode test changes.

### Where the logic lives

- `src/order.ts` / `src/ui/resume.ts` own the pure, testable seam. Add a small helper
  alongside `planResume` that, given `(seed, currentListIds, position)`, returns the id
  to navigate to (`shuffleIds(currentListIds, seed)[position] ?? null`). Reuse the
  existing `scrollToResume(listRoot, id)` for the scroll. **No new CB-DOM knowledge** —
  it composes `shuffleIds` + `readListQuestionIds` + `scrollToResume`, all already
  isolated in `src/order.ts` / `src/cb/` / `src/ui/resume.ts`.
- `src/entrypoints/content.ts` wires it: pre-mint the seed in `start('random')`, scroll
  the first shuffled row, and branch `onNext` on `orderMode`.

## Bright-line check

- **#1** read DOM only: we read rendered rows (`readListQuestionIds`) and scroll them.
  No `qbank-api`/`collegeboard.org` call; no id-navigation of CB.
- **#2** persist only IDs + student data: unchanged — still only the session
  (`orderMode`, `shuffleSeed`, `lastQuestionId`). No question text.
- **#3** no AI on CB content: untouched.
- **#4** user-initiated transitions: every question is opened by the student clicking a
  row. The extension only *scrolls*; it never auto-advances, prefetches, or enumerates.
- **#5 / #6** branding / fail-safe: untouched.

The fragile `src/cb/` layer gains **no new assumptions** (it only reuses
`readListQuestionIds`).

## Open product question (for the human reviewer)

The triager flagged one product choice, both options invariant-safe; this design takes
the **fuller** one (guide the next-in-shuffled-order row on *each* Next, returning the
student to the list to click it) rather than the minimal "set only the starting
question and let CB's native Next run from there". The fuller option is what actually
satisfies "shuffle the **order** of the loaded questions". The reviewer should confirm
the UX (return-to-list-and-click between questions in random mode) reads well on a real
CB page via **/verify-overlay** — see Visual check below.

## Visual check

This touches the overlay's navigation behavior (`src/ui/` / `content.ts`). Per the
issue-loop skill §6.5, the live rendering needs human eyes: the reviewer should run
**/verify-overlay** on a real CB question before merging. In headless CI there is no
dev Chrome and no human, so this is recorded as **visual check pending human review**.

## Testing (TDD)

Deterministic, mock-free where possible (seed read back from the persisted session).

- `src/ui/resume.test.ts` (or `src/order.test.ts`): the new next-id helper returns
  `shuffleIds(ids, seed)[position]` and `null` past the end / for an empty list.
- `src/entrypoints/content.test.ts`:
  - **random start scrolls the first shuffled row** into view (spy `scrollIntoView` on
    the expected row, computed from the session's persisted seed).
  - **random Next scrolls the next shuffled row** into view and **does NOT** click CB's
    native Next (a spied CB "Next" button stays un-clicked).
  - **regression:** list-mode Next still actuates CB's native Next (existing test).
