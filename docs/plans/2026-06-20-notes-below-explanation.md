# Move Note + Calculator + Desmos Below the Explanation — Implementation Plan

> **Scope:** reposition the note + calculator + Desmos controls in the answer overlay
> so they render *below* CB's answer explanation, by splitting the overlay into two
> Shadow hosts. All changes in `extension/src/ui/answer-overlay.ts` (+ its test).
> **Reference:** `docs/specs/2026-06-20-notes-below-explanation-design.md`. Issue #22.

## Steps

- [ ] **Tests first (test-author).** In `src/ui/answer-overlay.test.ts`:
  - Update "wires the remaining controls" to query `.fp-note`/`.fp-calc-pin`/`.fp-desmos`
    on the **extras** shadow, asserting the handlers still fire.
  - Update "re-mounting reuses the single host" → exactly one interaction host **and**
    one extras host after a double mount.
  - Add: extras host is a **later** direct child of `.answer-content` than `.rationale`
    (`compareDocumentPosition` → `DOCUMENT_POSITION_FOLLOWING`), before and after reveal.
  - Add: extras host is **not** hidden by the whitelist sweep; an after-mount CB
    injection is still hidden by the observer.
  - Add: `unmountAnswerOverlay` removes **both** hosts and leaves no `[data-fp-hidden]`.
  - Confirm they fail for the right reason (no extras host yet).

- [ ] **Implement (maker).** In `answer-overlay.ts`:
  - Add `EXTRAS_HOST_CLASS = 'fp-extras-host'`; an `isOurHost(el)` helper checking both
    host classes; use it in the whitelist sweep and in `hideCbNode`.
  - Split `renderBody` → interaction markup (head/progress/choices/actions/verdict) and
    a new `renderExtras` (note + calc block). Split `wire` accordingly.
  - In `mountAnswerOverlay`: find/reuse the interaction host (first child) **and** the
    extras host (append as last child); render + wire each shadow. Return the
    interaction shadow (unchanged contract).
  - In `unmountAnswerOverlay`: disconnect observer, restore `[data-fp-hidden]` nodes,
    remove **both** hosts.
  - Move the note/calc CSS into the extras shadow's `<style>` (or share the stylesheet).

- [ ] **Verify.** `npm run typecheck && npm test` green (was 385 passing). No new lint
  guard violations (`guard-ci.test.ts` runs inside the suite).

- [ ] **Review (checker).** Tests not weakened, suite + guards green, no bright line
  crossed, scope tight (only `answer-overlay.ts` + its test + docs).

- [ ] **PR.** `Closes #22`. Note that the reviewer should run `/verify-overlay` (UI diff).

## Risks / watch-items

- **Masking leak:** if the extras host isn't exempted from `hideCbNode`, the observer or
  sweep will `display:none` it — covered by the "extras host not hidden" test.
- **Double-mount duplication:** reuse logic must key each host by its own class —
  covered by the reuse test.
- **Teardown:** both hosts must be removed — covered by the teardown test.
- **content.ts unchanged:** handler signatures stay identical; if the maker is tempted to
  change the mount signature, stop — it shouldn't be necessary.
