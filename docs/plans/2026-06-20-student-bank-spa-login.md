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

## Step 4 — live verify (human-gated, real gate)

`/verify-overlay`: log out → log in → overlay appears on `/questionbank/results` **without** a hard
reload; UI **absent** on `/dashboard`; **educator** bank still mounts/grades (no regression). Content-free.

## Sequencing

Branch `loop/issue-70-student-bank-spa-login` based on PR #53's branch. Stacked PR (base = #53's branch);
retarget to `main` once #53 merges.
