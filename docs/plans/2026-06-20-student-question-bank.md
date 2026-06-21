# Plan — support the student question bank

*Issue #32 · Design: [`specs/2026-06-20-student-question-bank.md`](../specs/2026-06-20-student-question-bank.md) · Last updated: 2026-06-20*

Loop pipeline: test-author locks the failing tests → maker implements → checker audits.

## Constant

```
STUDENT_CB_MATCH = '*://mypractice.collegeboard.org/questionbank/*'
STUDENT_BANK_URL = 'https://mypractice.collegeboard.org/questionbank/results'
EDUCATOR_BANK_URL = 'https://satsuiteeducatorquestionbank.collegeboard.org/'
```

## Step 1 — failing tests (test-author, locked first)

1. **`tests/packaging.test.ts`** — broaden the manifest contract:
   - Add `STUDENT_CB` const. Assert every manifest's `host_permissions` **and**
     `content_scripts[0].matches` contain *both* the educator and student matches.
   - Broaden the "NOTHING else outside CB" allowlist to `{EDUCATOR_CB, STUDENT_CB, CONFIG,
     POSTHOG, DELETE_EP}`, and the "if collegeboard.org then it is one of the CB banks"
     check to accept exactly the educator **or** student match — still rejecting any other
     `collegeboard.org` host or a wildcard subdomain.
2. **`src/cb/banks.test.ts`** (new) — `bankUrlForHost(hostname)`:
   - student host → `STUDENT_BANK_URL`; educator host → `EDUCATOR_BANK_URL`;
     unknown / `undefined` / `''` → `EDUCATOR_BANK_URL` (safe public default).
   - Host/URL constants are the specific CB origins (not wildcards).
3. **`src/resilience/contract-check.test.ts`** — extend the block-notice test:
   - default call `renderBlockNotice(root)` → link still matches the educator host
     (preserve current behavior — happy-dom's default host is unknown → educator).
   - `renderBlockNotice(root, 'mypractice.collegeboard.org')` → link matches the student
     bank URL.

Run; confirm each fails for the right reason (missing student match / missing `banks.ts` /
notice ignores hostname). Commit as `test: …`.

## Step 2 — implement (maker, may not touch tests)

1. **Three manifests** — add `*://mypractice.collegeboard.org/questionbank/*` to
   `host_permissions` and `content_scripts[0].matches` (keep the educator entry).
2. **`src/cb/banks.ts`** (new) — export `EDUCATOR_BANK_HOST`, `STUDENT_BANK_HOST`,
   `EDUCATOR_BANK_URL`, `STUDENT_BANK_URL`, and
   `bankUrlForHost(hostname?: string): string`. Pure string mapping — no fetch, no DOM.
3. **`src/resilience/contract-check.ts`** — `renderBlockNotice(root, hostname?)`:
   default `hostname = root.ownerDocument?.location?.hostname ?? ''`; build the anchor
   `href` from `bankUrlForHost(hostname)`. The existing content.ts caller
   (`renderBlockNotice(mountHost(doc))`) is unchanged and picks up the live page host.

## Step 3 — review (checker)

Tests not weakened; the allowlist broadening did **not** admit a wildcard subdomain;
`guard-ci` untouched and green; scope limited to the three areas above; no bright line
crossed. Full suite + typecheck green.

## Verification

- `npm run typecheck && npm test` green.
- UI/resilience surface touched (`src/resilience/`, indirectly the overlay's redirect) →
  PR notes the reviewer runs **`/verify-overlay`** against the *student* bank with the
  issue's login before merge (content-free behavioral checks only).
