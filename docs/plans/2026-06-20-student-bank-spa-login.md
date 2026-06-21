# Plan — student bank post-login SPA route (path-aware boot)

*Issue #70 · Design: [`specs/2026-06-20-student-bank-spa-login.md`](../specs/2026-06-20-student-bank-spa-login.md) · Last updated: 2026-06-20*

Stacked on PR #53's branch. Loop: test-author → maker → checker → live verify.

## Step 1 — failing tests (test-author)

1. `tests/packaging.test.ts`: change `STUDENT_CB` to `*://mypractice.collegeboard.org/*`; keep the
   strict allowlist (every `collegeboard.org` host = exactly educator or student; no `*.collegeboard.org`).
2. Unit-test a colocated, exported predicate `isQuestionBankPage(loc: {hostname, pathname})`:
   - educator host + `/digital/search` → true; + `/digital/results` → true.
   - student host (`mypractice.collegeboard.org`) + `/questionbank/results` → true.
   - student host + `/dashboard`, `/login`, `/details` → false.
   - other host → false.
3. Boot/SPA activation test (the unit-testable slice): with a test seam (the maker exposes an
   `activate()`/`teardown()` + an SPA-route handler, or a `bootForLocation()` the test can call):
   - entering `/questionbank/results` (via simulated `pushState`/`popstate`) → start panel + Journal
     toggle mount; second route in → **no double-mount** (idempotent).
   - on `/login`/`/dashboard` → start panel + Journal toggle **absent**.
   - routing away from a QB page → `teardown()` removes our host + toggle.

## Step 2 — implement (maker; may not touch tests)

1. Broaden the student match in all 3 manifests (`host_permissions` + `content_scripts[0].matches`).
2. `content.ts`: add `isQuestionBankPage()` (host-keyed — educator host always true; student host only
   `/questionbank/*`). Extract the boot runner (`runLoop` + `mountPanelToggle` + `watchResultsList` +
   `onMessage`) into an idempotent `activate()`; add `teardown()` (remove the `mountHost` body host +
   `.fp-panel-toggle`, disconnect `watchResultsList`/observers). Boot: `activate()` iff QB page. Patch
   `history.pushState`/`replaceState` + `popstate` → on route change, `activate()` entering a QB page,
   `teardown()` leaving. Keep `guardedStart`'s kill-switch/block-detect gate wrapping activation.
3. **Educator preservation:** the predicate must return true for the educator host's `/digital/*` pages
   — do not key on `/questionbank` alone.

## Step 3 — checker

Educator overlay unaffected (predicate true on `/digital/*`; educator tests green); student UI off
`/dashboard`/`/login`, on `/questionbank/*`; broadened allowlist still strict; idempotent activate +
teardown; no bright line; scope = 3 manifests + content.ts + packaging.test.

## Two corrections found during review/verify (both genuine, both caught here)

1. **SPA detection (checker, round 1→2):** the first cut patched `history.pushState` from the content
   script — dead code in the isolated world (it never sees the page's main-world router calls), same trap
   as [[cb-react-isolated-world-reveal]]. Replaced with an always-on `location.href` poller
   (`checkForRouteChange`, ~400ms) + `popstate`; `location` *is* shared across worlds.
2. **Lingering-UI race (live verify, round 2→3):** the poller was href-change-gated and baselined at
   `/login` when CB's auth redirect beat the first tick → `teardown` never fired → the Journal toggle
   lingered on `/login` (an expired-session student hitting a `/questionbank` bookmark). Fixed by making
   the poll **reconcile by QB-status** every tick (`isQuestionBankPage(location)` vs the active state) —
   timing-independent. Locked by a regression test that reproduces the race; verified live (UI gone on
   `/login`).

## Step 4 — live verify (human-gated, real gate) — DONE 2026-06-20, all green

`/verify-overlay` on the real student bank (content-free): ✅ after login the overlay activates on
`/questionbank/*` with **no hard reload**; ✅ UI **absent** on `/login` and `/dashboard`; ✅ **educator**
bank still boots (no regression).

## Sequencing

Branch `loop/issue-70-student-bank-spa-login` based on PR #53's branch. Stacked PR (base = #53's branch);
retarget to `main` once #53 merges.
