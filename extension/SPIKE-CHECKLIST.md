# Task 12 — Live DOM-contract spike (manual, ~20 min)

**Goal:** prove the reader/observer extract real questions from the *live* College Board
educator bank, and capture CB's real **grid-in correct-answer format** so `scoring.ts` is
calibrated against reality (not just synthetic fixtures). This is the build-sequence gate
before any UI (Plan 2) is built — if the answer key isn't reliably in the rendered DOM, the
whole client-side scoring assumption changes, and we need to learn that here.

> ⚠️ **Do NOT log in to College Board.** Use the public, no-login Educator bank only.
> Logging in as the maker can create a clickwrap-assent trail (the BrandTotal trap). The
> educator question bank is browsable without an account.

The extension only ever **logs to the console** in this build. It stores nothing and prints
no question text — so it's safe to run on the live site.

---

## Step 1 — Load the unpacked extension

1. The build is already produced at `extension/dist/` (re-run `node scripts/build.mjs` if needed).
2. Chrome → `chrome://extensions`
3. Toggle **Developer mode** on (top-right).
4. **Load unpacked** → select the `extension/dist` folder.
5. Confirm the card shows **"Focused Practice (dev)"** with no errors.

---

## Step 2 — Open the bank and the console

1. Go to `https://satsuiteeducatorquestionbank.collegeboard.org/digital/search`
2. Filter **SAT → Math → Algebra** → **Search**.
3. Open DevTools (`Cmd-Option-I`) → **Console** tab. Filter the console on `focused-practice`.

> Note the path: detection only fires on a URL containing `/digital/results`. If filtering
> keeps you on `/digital/search`, the observer is dormant by design — make sure you're on
> the results view with a question modal open.

---

## Step 3 — Verify detection across question types

Open **at least 3 multiple-choice** and **2 grid-in** (student-produced response) questions.
For each, you should see exactly one console line per distinct question:

```
[focused-practice] question detected: <id> · <skill> · <difficulty> · choices: N · answerReadable: <bool>
```

For each question, confirm:

- [ ] An `id` is present (not blank/undefined).
- [ ] `skill` and `difficulty` look right for the question.
- [ ] `choices: 4` for multiple-choice; `choices: 0` for grid-in.
- [ ] Before revealing the answer: `answerReadable: false`.
- [ ] Click **"Show correct answer and explanation"**, then re-open / re-trigger the question
      and confirm `answerReadable: true`.

**If a line never appears** for an open question, the selectors in `src/cb/reader.ts` or
`src/cb/observer.ts` don't match the live DOM — record exactly what's different (see Step 5).

---

## Step 4 — Capture the grid-in answer format (TRUST-CRITICAL)

This is the real reason for the spike. A wrong verdict is the OnePrep trust-killer, so
`scoring.ts` must either grade a format correctly or fall to `{ graded:false }` (show CB's
answer, no red/green). We can only calibrate that against CB's *actual* strings.

For each grid-in, reveal the answer, then in DevTools inspect the text CB renders right after
**"Correct Answer:"** and record it verbatim:

| Question id | Exact "Correct Answer:" text | Single / list / range / other |
|-------------|------------------------------|-------------------------------|
|             |                              |                               |
|             |                              |                               |
|             |                              |                               |
|             |                              |                               |
|             |                              |                               |

For each captured string, mentally check it against `src/scoring.ts`:

- `splitAnswers()` splits on `,` `;` and the word `or`.
- `parseNumeric()` accepts integers, decimals (incl. leading-dot `.333`), and `a/b` fractions.
- `numericAccept()` accepts exact match, or — for a repeating decimal — the pick rounded **or**
  truncated to its own decimal places, when the pick carries ≥ 3 decimals.

Decide per format:

- ✅ **Handled** → no change needed.
- ⚠️ **Not handled but falls to `{ graded:false }`** → acceptable (we show CB's answer, no verdict).
- ❌ **Could produce a WRONG verdict** → this is a bug. Add a failing test to
  `src/scoring.test.ts` reproducing the exact string, then extend the parser to pass it.

---

## Step 5 — Record results and commit

Append a short **"Live DOM-contract spike — 2026-06-15"** note to
`docs/superpowers/specs/2026-06-15-sat-practice-overlay-design.md` (§12 step 1) recording:

- Which question types passed (MC / grid-in).
- Any selector mismatches found (and whether `reader.ts`/fixtures were updated).
- Whether the correct answer is in the DOM **before** reveal, or **only after** the reveal click.
- The grid-in formats observed (the table above).

```bash
# only if you had to fix selectors:
npx vitest run src/cb        # fixtures must still pass after any reader.ts change
git add extension/src/cb/
git commit -m "fix(extension): align CB-DOM reader/fixtures with live structure (spike)"

# the spike note itself:
git add docs/superpowers/specs/2026-06-15-sat-practice-overlay-design.md
git commit -m "docs: record live DOM-contract spike results"
```

---

## Acceptance

The reader extracts `id`, taxonomy, choices (MC), and `correctAnswer` (after reveal) for **both**
multiple-choice and grid-in on the live site, **and** every observed grid-in format is either
graded correctly or falls safely to the indeterminate path. If both hold, Plan 2 (the scored
overlay) is cleared to start.
