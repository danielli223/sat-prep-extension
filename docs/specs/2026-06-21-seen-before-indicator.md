# Spec — "Seen before" indicator on the in-question overlay

> Issue: #28 — *Reading: show an indicator of whether you've done a problem before.*
> Last updated: 2026-06-21
> Status: implemented via the autonomous issue loop (test → make → check → PR).

## Problem

While doing a problem in the overlay, the student has no signal that they've
already attempted this exact question before (and how it went). The results-list
**badger** (`src/ui/badger.ts`) already shows a done/missed/new chip per row on the
list view — but once a question is open, that signal is gone. Issue #28 asks for the
same signal *in the question itself*.

The issue is filed under "Reading", but the signal is taxonomy-agnostic — it depends
only on whether the question's ID is in the student's own attempt journal — so it
ships for **all** sections, exactly like the list badger.

## Compliance (bright-line invariants, CLAUDE.md §1–6)

This feature crosses **no** bright line, because it is derived entirely from the
student's own data:

- **§1 (rendered DOM only):** the current question's ID is already read from the
  rendered modal by `src/cb/reader.ts` (`QuestionView.id`, the "Question ID: <8 hex>"
  header). No `qbank-api`, no CB endpoint, no new DOM surface.
- **§2 (persist only IDs + the student's own data):** *nothing new is persisted.* The
  indicator is a **read** over the existing attempt log via
  `journal.getSeen(db) → Record<questionId, 'done' | 'missed'>`. No question text is
  read, stored, or sent. No new store field, no questionId→metadata index
  (the §10 guardrail in `journal.ts` stays intact).
- **§3 (no AI on CB content):** the indicator's text is one of three **fixed string
  labels** chosen by a status enum — never any CB-derived string. No model involved.
- **§4 (user-initiated transitions):** the indicator only reflects the question the
  student already opened; no prefetch, no enumeration.
- **§5/§6:** unaffected.

This is mechanically the same compliant pattern the project already ships in the list
badger — extended into the overlay.

## Behavior

When the overlay mounts for a question, it shows a small status badge derived from the
student's prior attempts on that exact question ID:

| Prior status | Source                                  | Badge label              |
|--------------|-----------------------------------------|--------------------------|
| `new`        | ID absent from `getSeen` map            | `New to you`             |
| `done`       | `getSeen[id] === 'done'` (latest right) | `Seen before — got it right` |
| `missed`     | `getSeen[id] === 'missed'` (latest wrong) | `Seen before — missed it` |

"Prior" means *as of the start of this practice sitting*: the seen-map is snapshotted
once when `runLoop` starts and is **not** refreshed mid-session. This keeps the badge
stable across CB's in-place re-renders of the same question — answering a question this
sitting does not flip its own badge from "New to you" to "got it right" mid-question.
The dominant real flow (open the Question Bank, practice questions answered on previous
days) is served correctly: those show "Seen before …".

## Design

Three small, layered changes; CB-shape knowledge stays in `src/cb/`.

1. **`src/ui/view-model.ts`** — add `priorStatus: 'new' | 'done' | 'missed'` to
   `CardVM`, and a 4th param to `toCardVM(view, index0, total, priorStatus = 'new')`
   that threads it in. Pure mapping; defaults to `'new'` when omitted (so existing
   call sites and tests stay valid).

2. **`src/ui/answer-overlay.ts`** — `renderBody` renders a
   `<div class="fp-seen" data-prior="…">LABEL</div>` near the progress header, using a
   fixed `SEEN_LABEL` map of the three constant strings (mirrors `badger.ts`'s `LABEL`
   pattern). Styled per state in `ANSWER_CSS` (done=green, missed=red, new=gray, to
   match the badger pill palette). No CB content ever enters this node.

3. **`src/entrypoints/content.ts`** — in `runLoop`, snapshot
   `const priorSeen = await getSeen(db)` once at start (before wiring observers).
   `showQuestion` passes `priorSeen[view.id] ?? 'new'` into `toCardVM`.

## Test surface (locked before implementation)

- `view-model.test.ts`: `toCardVM` threads `priorStatus` (done/missed/new) and
  defaults to `'new'` when the 4th arg is omitted; stem still never leaks.
- `answer-overlay.test.ts`: mounting a VM with each `priorStatus` renders `.fp-seen`
  with the right `data-prior` + fixed label; the leak-guard (no stem text in the
  shadow) still holds.
- `content.test.ts`: a question whose ID was previously **missed** opens with the
  "missed" badge; a never-seen question opens with "New to you" — proving `runLoop`
  looks the current question's ID up against the student's own journal.

The store guard (`assertNoQuestionContent`) and the existing VM/overlay leak-guards
remain green — no new persisted field is introduced.
