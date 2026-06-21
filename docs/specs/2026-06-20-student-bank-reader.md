# Design — student question bank reader (the `.cb-modal-*` DOM)

*Issue #55 (follow-up to #32 / PR #53) · Last updated: 2026-06-20*

> Source: a live, **content-free** `/verify-overlay` spike on the real student bank
> (`mypractice.collegeboard.org/questionbank/results`, signed in). Every fact below came
> from reading **tag names / CSS classes / attribute names / counts / structural
> booleans** — never question, choice, passage, or rationale text (invariant #3).

## Problem

PR #53 made the content script *inject* on the student bank, but the overlay never
mounts: `src/cb/` keys on the **educator** bank's DOM (`.cb-dialog-container`,
`.hide-rationale-checkbox`), which the student bank does not use. The student bank's
question DOM is a different shape. This issue teaches `src/cb/` that second shape, so the
overlay mounts and the scored loop works on both banks.

## Student-bank DOM map (content-free)

```
.cb-modal.cb-open                                  ← question modal (see "modal detection")
└─ .cb-modal-overlay[data-cb-modal-close]
   └─ .cb-modal-container[role=dialog][aria-modal]
      └─ .cb-modal-content
         └─ .question-info
            ├─ .question-detail-info > .question-banner
            │     └─ table.cb-table   ← TAXONOMY. thead cols: [Assessment, Section, Domain, Skill, Difficulty]
            │                            tbody = 1 row of 5 cells (the values for this question)
            └─ .row
               ├─ .question-content.col-md-6     ← STEM: `.question > div > p …` (MathJax for math)
               └─ .answer-content.col-md-6       ← ANSWER INTERACTION + our overlay mount target
                     • MC:      `ul > li` × N  (bare <li>, NO radio/`name`; click-driven; letter by POSITION A,B,C,D…)
                     • grid-in: empty until reveal
                     • on reveal: `.rationale` is injected HERE
```

Reveal control: **`.cb-checkbox.inline-rationale-toggle`** wrapping a **class-less**
`input[type=checkbox]`. A real click injects `.rationale` into `.answer-content` (same
*outcome* as the educator bank, different trigger).

Correct answer: read from `.answer-content > .rationale` after reveal (the bold
`p.cb-font-weight-bold` is the correct-answer line) — same `.rationale` strategy the
educator reader already uses.

Question ID: `Question ID: <8-hex>` is present in the modal text, exactly like the
educator bank — the persisted-key read is unchanged.

Next button: a `<button>` whose text is `Next` — `clickCbNext` already handles it.

Results list: `table.cb-table-react` — **shared** with the educator bank (the badger /
list-reader already work).

### Educator vs student — what differs

| Concern | Educator bank | Student bank |
|---|---|---|
| Question modal | `.cb-dialog-container` | `.cb-modal.cb-open` **containing question chrome** |
| Stem location | within the dialog | `.question-content.col-md-6` |
| MC choices | (educator markup) | `.answer-content ul > li` (bare, click-driven, letter by position) |
| Reveal trigger | `.hide-rationale-checkbox input` | `.cb-checkbox.inline-rationale-toggle input` |
| Rationale / correct answer | `.rationale` | `.rationale` (**same**) — injected into `.answer-content` |
| Taxonomy | (educator source) | `.question-banner table.cb-table` (cols Assessment/Section/Domain/Skill/Difficulty) |
| Question ID | `Question ID: <8hex>` | `Question ID: <8hex>` (**same**) |
| Overlay mount target | `.answer-content` | `.answer-content` (**same** — mount strategy unchanged) |
| Results list | `table.cb-table-react` | `table.cb-table-react` (**same**) |

### Modal detection — the important subtlety

The student bank also opens a **separate** `.cb-modal.cb-open` for an **inactivity-timer
warning** (`.remaining-time`, `.cb-exclamation-circle`, no `.answer-content`). So student
modal detection must match "`.cb-modal.cb-open` **that contains question chrome**" (e.g.
`.answer-content` / `.question-info`), **not** any `.cb-modal.cb-open` — or it binds to
the timer popup. Same care must extend to `block-detect.ts`'s `hasQuestionChrome`.

## Approach (all within `src/cb/` + the `content.ts` modal/reveal helpers)

Generalize, don't replace — both banks must keep working.

1. **One shared selector module** (extend `src/cb/fingerprint.ts` or add to the cb layer):
   name the question-modal selector for both banks and the "is this a question modal"
   predicate (has question chrome). Everything else imports it — no scattered OR-selectors.
2. **`reader.ts`**: add a student read path — stem from `.question-content .question`,
   choices from `.answer-content ul > li` (letters by position), correct answer from
   `.rationale`, taxonomy from `.question-banner table.cb-table` (by column), ID from the
   `Question ID:` text. Dispatch on which shape the passed modal is.
3. **`observer.ts` / `content.ts` helpers** (`currentModal`, `overlayShadow`,
   `currentCorrectAnswer`): recognize the student modal in addition to `.cb-dialog-container`.
4. **`ensureAnswerRevealed`** (`content.ts`): also drive the student reveal
   (`.inline-rationale-toggle input[type=checkbox]`) — real click only, never `box.checked=`
   (the isolated-world React-tracker trap — see [[cb-react-isolated-world-reveal]]).
5. **`block-detect.ts`**: `hasQuestionChrome` recognizes the student modal too (§6 fail-safe).
6. **Overlay mount**: unchanged — `.answer-content` is the target on both banks.

## Tests (synthetic fixtures — never real CB text)

Add to `src/cb/__fixtures__/`: a student-bank MC modal, a student-bank grid-in modal,
the `.inline-rationale-toggle` reveal + injected `.rationale`, and the `.cb-table`
taxonomy — all hand-authored to the structure above with **placeholder/lorem** stem,
choices, and rationale. Reader/observer tests parse them and assert the extracted
`QuestionView` (id, section/domain/skill/difficulty, choices, correctAnswer). The
existing **educator** fixtures and tests must stay green (a regression there is a hard stop).

## Inferred vs verified — what the final live `/verify-overlay` must confirm

These were inferred structurally (content-free) and must be confirmed by the live pass
(grade a real student question correctly), because I could not read the values:

- The correct-answer line is the bold `p` inside `.rationale` (MC: a letter; grid-in: a value).
- MC choice **letters by position** match CB's A/B/C/D ordering.
- The taxonomy `tbody` cells align to the `[Assessment, Section, Domain, Skill, Difficulty]`
  header order.

## Acceptance

- Overlay **mounts** on a real student question (`.fp-answer-host` count > 0); Check grades
  correctly; Reveal shows CB's rationale; both MC and grid-in work.
- The **educator** bank still mounts + grades (no regression).
- Full suite + typecheck + legal guard green; all three bundles build.
- Decision recorded on whether to broaden the match to `*://mypractice.collegeboard.org/*`
  (to survive the post-login SPA route) or keep `/questionbank/*`.
