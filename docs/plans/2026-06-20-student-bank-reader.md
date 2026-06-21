# Plan — student question bank reader

*Issue #55 · Design: [`specs/2026-06-20-student-bank-reader.md`](../specs/2026-06-20-student-bank-reader.md) · Last updated: 2026-06-20*

Stacked on PR #53's branch (`loop/issue-32-student-question-bank`) so the manifest match +
the reader land together and one merge closes #32 and #55. Loop: test-author → maker → checker → live verify.

## Step 1 — failing tests + synthetic fixtures (test-author; locked first)

New `src/cb/__fixtures__/`:
- `student-mc.html` — `.cb-modal.cb-open` → `.cb-modal-overlay` → `.cb-modal-container[role=dialog]`
  → `.cb-modal-content` → `.question-info` with: `.question-banner table.cb-table` (thead
  [Assessment, Section, Domain, Skill, Difficulty]; tbody 1 row of placeholder values),
  `.question-content.col-md-6 > .question` (placeholder stem), `.answer-content.col-md-6 > ul > li × 4`
  (placeholder choice text, no radios), a `Question ID: <8-hex placeholder>` node, and a
  `.cb-checkbox.inline-rationale-toggle` reveal control.
- `student-grid-in.html` — same shell, no `ul/li`, empty `.answer-content`.
- A revealed variant (or a test that toggles reveal) where `.answer-content > .rationale` holds a
  placeholder bold correct-answer line.
- An inactivity-timer modal sibling (`.cb-modal.cb-open` with `.remaining-time`, no `.answer-content`)
  to lock the "don't bind to the timer popup" rule.

Tests (fail before impl): `reader.test.ts` parses the student fixtures → asserts the `QuestionView`
(id, section/domain/skill/difficulty, choices with letters A.. by position, correctAnswer after reveal);
`observer.test.ts` / a content-helper test asserts `currentModal` finds the student modal and **ignores
the timer modal**; a reveal test asserts the student toggle path. **Educator fixtures/tests stay green.**

## Step 2 — implement (maker; may not touch tests)

Refined scope (deeper spike): the inner question DOM is **shared**, so `reader.ts` is **unchanged**.

1. Shared constant `QUESTION_MODAL_SELECTOR = '.cb-dialog-container, .cb-modal-container'` (one place in the cb layer).
2. `observer.ts`: (a) path gate accepts `/questionbank/results` as well as `/digital/results`; (b) modal
   lookup uses the shared selector, **keeping the `"Question ID:"` filter** (rejects the inactivity-timer popup).
3. `content.ts` `currentModal`: use the shared selector (still keyed by `Question ID: <id>`).
   `overlayShadow`/`currentCorrectAnswer` ride on it.
4. `ensureAnswerRevealed`: also drive `.inline-rationale-toggle input[type=checkbox]` — real click only.
5. `reader.ts`, taxonomy, choices, `block-detect.ts` (`[role=dialog]` already covers it), overlay mount,
   results list: **unchanged**.

Keep both banks green; legal guard green (no CB endpoint/host added — banks.ts precedent).

## Step 3 — checker

Both banks read correctly (no educator regression), tests not weakened, suite + guards green, scope inside
`src/cb/` + the content.ts helpers, no bright line crossed.

## Step 4 — live re-verify (human-gated, the real gate)

`/verify-overlay` on the **student** bank: overlay mounts (`.fp-answer-host` > 0), Check grades a real MC
**and** a real grid-in correctly, Reveal shows CB's rationale; then re-confirm the **educator** bank still
works. Confirm the inferred-vs-verified items in the spec. Only then un-draft PR #53.

## Decision to make during this issue

Broaden the match to `*://mypractice.collegeboard.org/*` (survives the post-login SPA route, wider surface)
vs keep `/questionbank/*` (tighter, but the overlay only appears on a fresh `/questionbank/*` load).
