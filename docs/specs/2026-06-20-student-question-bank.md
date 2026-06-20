# Design — support the student question bank

*Issue #32 · Last updated: 2026-06-20*

## Problem

The overlay only runs on College Board's **educator** Question Bank
(`satsuiteeducatorquestionbank.collegeboard.org`). Students taking the SAT use the
**student** practice site, whose Question Bank lives at a different origin and behind a
login:

```
https://mypractice.collegeboard.org/questionbank/results
```

The reporter (and triage) confirm the two banks are structurally the same page — same
rendered question modal, same results table, same taxonomy. The `src/cb/` reader layer
hard-codes no host (it reads whatever DOM it is mounted on), so the only reason the tool
does not work on the student bank is that the extension never *runs* there: the
manifests match only the educator origin.

## Why this is invariant-clean

A second match pattern does not weaken any bright line (`CLAUDE.md` §1–6):

- **§1 Read the rendered DOM only.** A `content_scripts.matches` / `host_permissions`
  entry grants *content-script DOM access*, never network access. We still call no CB
  endpoint; the legal guard (`tests/guard-ci.test.ts`) still forbids any
  `fetch/XHR/sendBeacon/... → collegeboard.org`. The student's login happens in their
  own browser session — the extension never touches CB auth, cookies, or endpoints.
- **§2 Persist only IDs + student data.** Unchanged — same `store.ts` / `guard.ts` path.
- **§3 No AI on CB content.** Unchanged.
- **§4 User-initiated transitions.** Unchanged — same observer, same CB-control actuation.
- **§5 Nominative trademark use.** Unchanged — the new host appears only as a match
  pattern, never in branding.
- **§6 Fail safe.** The kill-switch, `block-detect`, and `contract-check` are
  origin-agnostic and run on the new host too. One refinement (below): the block notice
  now points the blocked student back to **the bank they are actually on**.

## Scope

**In scope**

1. **Manifest match (the feature).** Add the student Question Bank match to all three
   manifests (`manifest.json`, `manifest.firefox.json`, `manifest.edge.json`), in both
   `host_permissions` and `content_scripts[0].matches`, alongside the educator entry.

   Pattern: `*://mypractice.collegeboard.org/questionbank/*`

   *Path-scoped, not whole-host.* The educator host is a dedicated Question-Bank host, so
   its pattern is `/*`. `mypractice.collegeboard.org` is College Board's general student
   practice portal — the Question Bank is one section of it (`/questionbank/...`). Scoping
   to `/questionbank/*` keeps the content script off unrelated student-portal pages
   (minimal surface; §4 spirit) while covering the reporter's URL (`/questionbank/results`)
   and the in-place question modal (same SPA route). It is a *specific origin*, never a
   `*.collegeboard.org` wildcard subdomain.

2. **Host-aware block notice (§6 coherence).** `renderBlockNotice` currently always links
   to the educator bank. On a block it should send the student to the Question Bank they
   are using, so the disable→redirect fail-safe lands them where their session already
   works. Introduce `src/cb/banks.ts` — the single place that names the two CB bank
   origins and maps a hostname → its bank URL — and have `renderBlockNotice` use it.

**Out of scope (documented follow-ups, not regressions)**

- The journal panel's "Practice [skill] on CB" / "Find on CB" links and the popup's
  "Open SAT Question Bank" link keep pointing at the **educator** search page. The
  educator bank is *public (no login)* and serves the same questions, so it remains a
  valid entry point/fallback for any student. Making these host-aware needs a verified
  student-bank skill-filter URL, which a live `/verify-overlay` pass should establish
  first. Tracked as a follow-up; not required for "the tool works on the student bank."

## Acceptance

- The overlay mounts and the scored loop runs on
  `https://mypractice.collegeboard.org/questionbank/results` (verified live via
  `/verify-overlay` / the CDP harness, with the student login from the issue — content-free
  checks only; no CB text fed to any model).
- All three manifests carry both the educator and student matches; no other
  `collegeboard.org` host is permitted (allowlist stays tight — no wildcard subdomain).
- On a CB block, the notice links to the student bank when the page is on
  `mypractice.collegeboard.org`, and to the educator bank otherwise (unchanged default).
- Full suite + typecheck + the legal guard stay green.

## Risks / live-verification notes

- The exact student-bank routes are unverified from a unit-test sandbox. If the live
  `/verify-overlay` pass finds the Question Bank served outside `/questionbank/*` (e.g. a
  login redirect lands on a different route that still needs the overlay), broaden the
  pattern to `*://mypractice.collegeboard.org/*` — a one-line manifest change, still a
  specific origin. The reviewer should confirm before merge.
- `src/cb/` is expected to need **no** source change. Per repo convention, any new
  CB-DOM assumption discovered live must land as a `src/cb/__fixtures__/` fixture + reader
  test, isolated to `src/cb/`.
