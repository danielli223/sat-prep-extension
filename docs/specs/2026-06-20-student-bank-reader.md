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

### Educator vs student — what differs (REFINED after deeper spike)

**The two banks share the entire INNER question DOM.** `readQuestion` already reads the
exact structures the student bank uses, so **`reader.ts` needs no change** — it just needs
to be handed the right modal root. Only the outer modal wrapper, the reveal trigger, and
the observer's path gate differ.

| Concern | Educator bank | Student bank | Change? |
|---|---|---|---|
| Question-modal **root** (passed to `readQuestion`) | `.cb-dialog-container` | `.cb-modal-container` (the `[role=dialog]`; contains the ID `h4` in `.cb-modal-header > .question-modal-header` **and** the content) | **observer + currentModal** |
| Results-page **path gate** (observer line 12) | `/digital/results` | `/questionbank/results` | **observer** |
| Reveal trigger | `.hide-rationale-checkbox input` | `.cb-checkbox.inline-rationale-toggle input` (class-less checkbox) | **ensureAnswerRevealed** |
| Stem | `.question-content .question` | `.question-content .question` | **same** |
| MC choices | `.answer-choices ul > li` (letter by index) | `.answer-choices ul > li` (letter by index) | **same** |
| Taxonomy | `table.cb-table` rows, cols [Assessment, Section, Domain, Skill, Difficulty] | identical | **same** |
| Rationale / correct answer | `.rationale` → "Correct Answer:" | identical | **same** |
| Question ID | `h4` "Question ID: `<8hex>`" | `h4` "Question ID: `<8hex>`" (in the modal header) | **same** |
| Overlay mount target | `.answer-content` | `.answer-content` | **same** |
| Results list | `table.cb-table-react` | `table.cb-table-react` | **same** |
| Block detection | `[role=dialog]` chrome | `.cb-modal-container` has `[role=dialog]` | **same (already covered)** |

### Modal detection — the important subtlety

The student bank also opens a **separate** `.cb-modal.cb-open` for an **inactivity-timer
warning** (`.remaining-time`, `.cb-exclamation-circle`, no question content). The existing
observer/`currentModal` discipline — *match the container that holds `"Question ID:"`* —
already excludes it, **so keep that filter** when generalizing the selector to
`.cb-dialog-container, .cb-modal-container`. Do not match a bare `.cb-modal.cb-open`.

## Approach (minimal — `src/cb/observer.ts` + the `content.ts` modal/reveal helpers)

Generalize, don't replace — both banks must keep working. `reader.ts` is **unchanged**.

1. **`observer.ts`**: (a) the path gate (line 12) accepts the student results path
   (`/questionbank/results`) in addition to `/digital/results`; (b) the modal lookup (line 13)
   matches `.cb-dialog-container, .cb-modal-container`, keeping the `"Question ID:"` filter
   (which rejects the timer popup). `readQuestion(modal)` then works as-is.
2. **`content.ts` `currentModal`**: match `.cb-dialog-container, .cb-modal-container` (still
   keyed by `Question ID: <id>`). `overlayShadow` / `currentCorrectAnswer` ride on it.
3. **`ensureAnswerRevealed`** (`content.ts`): also drive `.inline-rationale-toggle
   input[type=checkbox]` — real click only, never `box.checked=` (the isolated-world
   React-tracker trap — see [[cb-react-isolated-world-reveal]]).
4. **`reader.ts`, taxonomy, choices, `block-detect.ts`, overlay mount, results list:
   unchanged.** Prefer a single shared selector constant (`QUESTION_MODAL_SELECTOR =
   '.cb-dialog-container, .cb-modal-container'`) in the cb layer over scattering the OR.

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
