# Randomize (loaded results) — Plan

*Date: 2026-06-21 · Issue #31 · Design: `docs/specs/2026-06-21-randomize-loaded-results-design.md`*

Guided shuffle navigation for random mode. Compliant posture = the Resume model
(scroll a rendered row; the student clicks it). No auto-load, no id-navigation.

## Tasks (TDD order)

1. **Failing tests (test-author).**
   - Pure helper: given `(seed, listIds, position)` → `shuffleIds(listIds, seed)[position]`,
     `null` past the end and for an empty list. (`resume.test.ts` or `order.test.ts`.)
   - `content.test.ts`: starting a **random** session scrolls the first shuffled-order
     row into view (seed read back from the persisted session).
   - `content.test.ts`: a **random** Next scrolls the next shuffled-order row into view
     and does **not** click CB's native Next.
   - `content.test.ts`: regression — **list** Next still clicks CB's native Next.

2. **Implement (maker).**
   - `src/ui/resume.ts` (or `src/order.ts`): add the next-id helper composing
     `shuffleIds`; reuse `scrollToResume` for the scroll.
   - `src/entrypoints/content.ts`:
     - `start('random')`: mint the seed up front; compute the order over the loaded
       list ids; scroll the first id into view (no-op if the list isn't rendered yet);
       pass the pre-minted seed into the session created in the observer.
     - `onNext`: branch on `orderMode`. Random ⇒ advance position, tear the overlay
       down (`unmountAnswerOverlay`, return to list), scroll the next shuffled row;
       never `clickCbNext`. List ⇒ unchanged.

3. **Review (checker).** Tests not weakened; full suite + guards green; bright lines
   #1/#4 held (no api-host reference, no id-navigation, transitions still user-clicked);
   list-mode navigation untouched; scope tight.

## Guardrails

- Keep all CB-shape knowledge in `src/cb/` — the fix only *reuses* `readListQuestionIds`.
- No `qbank-api` / `collegeboard.org` reference (CI guard).
- Persist nothing new (session shape unchanged): store guard stays green.
- UI/navigation diff ⇒ **/verify-overlay** by the human reviewer; headless = visual
  check pending.
