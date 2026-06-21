# Design — student bank, post-login SPA route (path-aware boot)

*Issue #70 (follow-up to #32/#55/PR #53) · Last updated: 2026-06-20*

## Problem

The overlay works on the student bank when `/questionbank/results` loads directly (or on a
hard reload), but after CB's login redirect the document commits at `/login` — which the
`*://mypractice.collegeboard.org/questionbank/*` content-script match does **not** cover —
and the app SPA-routes into the bank without a fresh document load. So the content script
never injects, and the overlay only appears after a manual hard reload (which students
won't know to do).

## Why this isn't a one-line manifest change

Broadening the match to `*://mypractice.collegeboard.org/*` makes the script inject on the
whole student portal — but our boot (`content.ts`, the `if (chrome.runtime?.id)` block →
`guardedStart` → `runLoop` → `renderStartPanel`, plus `mountPanelToggle`) renders the start
panel + Journal toggle **unconditionally, with no path check**. That's fine today only
because every matched host is QB-dedicated. With a portal-wide match it would splatter our
UI across `/dashboard`, `/details`, `/login`, … So the match broadening **must** be paired
with a path-aware boot.

## Design

1. **Broaden the match.** In all three manifests, change the *student* entry in both
   `host_permissions` and `content_scripts[0].matches` from
   `*://mypractice.collegeboard.org/questionbank/*` to `*://mypractice.collegeboard.org/*`.
   Educator entry untouched. Still a specific origin — never a `*.collegeboard.org` wildcard.

2. **One host-keyed predicate** (colocated + unit-testable), e.g. `isQuestionBankPage(loc)`:
   - **educator host** (`satsuiteeducatorquestionbank.collegeboard.org`) → **always true**
     (the host is entirely the QB; its pages are `/digital/*`). *This preserves educator
     behavior exactly — the #1 way to ship green-but-broken is a predicate that keys on
     `/questionbank` only and silently disables the educator overlay.*
   - **student host** (`mypractice.collegeboard.org`) → true only for `/questionbank/*`.
   - anything else → false.

3. **Path-aware, SPA-reactive boot.** Extract the boot body (the `guardedStart` runner:
   `runLoop` + `mountPanelToggle` + `watchResultsList` + the `onMessage` listener) into an
   **idempotent `activate()`**. Then:
   - On boot: `activate()` iff `isQuestionBankPage(location)`.
   - Patch `history.pushState`/`replaceState` + listen to `popstate`; on each SPA route,
     re-evaluate: entering a QB page → `activate()`; leaving one → `teardown()`.
   - `activate()` is idempotent (no double-mount on repeated routes); `teardown()` removes
     our mounted host + Journal toggle and disconnects observers so nothing lingers on
     `/dashboard` etc.
   - `guardedStart`'s kill-switch + block-detect gate still wraps activation (fail-safe §6
     intact, runs first regardless of path).

## Educator preservation (hard requirement, not a nicety)

The educator bank's pages are `/digital/*`, not `/questionbank/*`. The predicate keys on
host so the educator overlay keeps activating on every educator page exactly as today. The
checker must confirm no educator regression (the existing educator content/observer tests
stay green, and the predicate returns true for `/digital/*`).

## Test surface

- `tests/packaging.test.ts`: update `STUDENT_CB` to `*://mypractice.collegeboard.org/*`; the
  strict allowlist still rejects any third CB host / `*.collegeboard.org` wildcard.
- Unit-test `isQuestionBankPage`: educator `/digital/search` + `/digital/results` → true;
  student `/questionbank/results` → true; student `/dashboard`, `/login`, `/details` → false.
- Boot/SPA test (the part that *is* unit-testable): simulate a `pushState` from `/login`
  into `/questionbank/results` and assert `activate()` runs (start panel + Journal toggle
  mount); assert they are absent on `/login`/`/dashboard`; assert idempotency (a second
  route in doesn't double-mount) and `teardown()` on routing away.

## What's live-only (the real gate)

Content-script injection timing + the actual login→SPA flow can't be unit-tested. The live
`/verify-overlay` pass must confirm: log out → log in → the overlay appears on
`/questionbank/results` **without** a hard reload; our UI is **absent** on `/dashboard`;
and the **educator** bank still works (no regression). Content-free checks only.

## Sequencing

Stacks on the unmerged **PR #53** (branch `loop/issue-32-student-question-bank`). #70's
branch `loop/issue-70-student-bank-spa-login` is based on it so the manifest + packaging
diffs apply cleanly. When #53 merges, retarget #70's PR to `main`.
