# SAT Practice Overlay — Plan 4: Resilience · Packaging · Privacy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the overlay safe to ship — a hosted kill-switch, 403/block detection that disables instead of retrying, a DOM-contract self-check that degrades to a non-verdict banner, an extended legal CI guard, cross-browser packaging (Chrome/Firefox/Edge + sideload), and a privacy policy with the Limited-Use + non-affiliation notices.

**Architecture:** A small `src/resilience/` layer of pure-ish, network-disciplined modules — `isEnabled()` fetches one boolean flag from OUR config host (never `collegeboard.org`) with a cached default-ON; `block-detect` classifies 403/block signals and disables without ever retrying or calling CB's API; `contract-check` verifies CB's expected DOM nodes per question, counts failures, and renders the "Couldn't read this one — answer it on CB" banner (plus the §8.3 "use CB directly" block notice) inside the single shadow host. Plan 4 then *splices* the §2.5 enablement gate, the §8.3 block-notice, the §2.4 degraded-read path, and §8.5 best-effort store writes into Plan 2/3's already-open mount call sites in `content.ts` via four surgical edits — it does not recreate any Plan 2/3 file or drop their `runLoop`/badger/panel — and packages/manifests/privacy-docs the build for three browsers.

**Tech Stack:** TypeScript · esbuild (bundling, multi-target manifests) · Vitest + happy-dom (tests) · the existing `src/ui/host.ts` shadow root + `TT_POLICY` TrustedTypes policy from Plan 2. Code lives under `extension/`.

**Spec:** `docs/superpowers/specs/2026-06-15-sat-practice-overlay-design.md`
**Contract:** `docs/superpowers/plans/2026-06-15-plans-2-4-interface-contract.md`

**This is Plan 4 of 4** (per the spec's build sequence §12; Plan-by-plan ownership in contract §3):
1. Foundation & DOM-contract (`2026-06-15-sat-overlay-foundation.md`) — done.
2. Scored loop — focus card, score, explanation, randomize, calculator (`2026-06-15-sat-overlay-scored-loop.md`).
3. Journal, progress, badger, guided resume (`2026-06-15-sat-overlay-journal.md`).
4. **Resilience · packaging · privacy** ← this plan (spec §8 error handling, §10 guardrails, §11 O2/O3, §12 steps 4–5).

**Legal invariant enforced throughout (contract §0):** the kill-switch and block-detector `fetch` **only OUR config host** — never `collegeboard.org`, never `qbank-api`, never an Akamai-token replay. On any CB block we **disable and point to CB** — we never retry, never enumerate, never call the API. The contract-check banner is **non-verdict** by construction (it shows no red/green). The existing CI guard (Plan 1 Task 8) is **extended, not duplicated**, to machine-enforce these from this plan on.

---

## Boundary note — what this plan reuses vs. inserts (contract §2 / §3)

Plan 4 introduces only the symbols in contract §2.5 and §2.4-enrichment. It **reuses** these exactly, never redefining them:

- `mountHost(doc: Document): ShadowRoot`, `HOST_ID`, `TT_POLICY` — from `src/ui/host.ts` (Plan 2 creates; this plan reuses). All banner `innerHTML` goes through `TT_POLICY` (contract §2.1, spec §8.4).
- The CB shared host `*://satsuiteeducatorquestionbank.collegeboard.org/*` — the existing manifest match (Plan 1); preserved across all three browser variants.
- The Plan 2/3 mount call sites in `src/entrypoints/content.ts` — Plan 2 mounts the loop (`runLoop`: start panel, scoring, `recordAttempt`/`saveNote`/`saveSession`, calculator, §2.3 session writes) unconditionally and Plan 3 adds the badger/panel (`refreshBadges`/`mountPanelToggle`/`handleMessage`); both leave the §2.4 read-failure hook and §2.5 gate **open** (contract §2.4, §2.5). Plan 4 (Task 8) makes four surgical edits: wraps the bootstrap body in `guardedStart` (`if (await isEnabled())` + the §8.3 `renderBlockNotice` on a CB block), routes `showQuestion`'s `renderCard(...)` through `handleQuestion` (the §2.4 banner path), and wraps the store writes in `safeWrite` (§8.5). **No Plan 2/3 export, call site, or loop is removed or recreated.**
- The existing CI guard `extension/tests/guard-ci.test.ts` (Plan 1 Task 8) — extended in Task 7, not duplicated.

Plan 4 **creates** (contract §2.5, §3 "Plan 4"): `src/resilience/killswitch.ts` (`isEnabled()`), `src/resilience/block-detect.ts`, `src/resilience/contract-check.ts`.

> **Execution dependency:** this plan modifies `src/entrypoints/content.ts` at the call sites Plan 2 (and Plan 3) create. Execute Plan 4 **after** Plans 2 and 3. Task 8 below shows the **exact** four-edit splice against the post-Plan-3 shape of `content.ts` (Plan 2 Task 7's `runLoop` + Plan 3 Tasks 6/8's `refreshBadges`/`mountPanelToggle`/`handleMessage` + bootstrap IIFE): add the three Plan-4 imports, add `handleQuestion`/`guardedStart`/`safeWrite`, route `showQuestion`'s final `renderCard(...)` through `handleQuestion`, wrap the store writes in `safeWrite`, and wrap the bootstrap body in `guardedStart`. **No Plan 2/3 export, call site, or loop is removed or recreated.**

---

## File structure

```
extension/
  CONFIG_HOST.md                          # CREATE: where OUR config flag is hosted + JSON shape
  PRIVACY.md                              # CREATE: privacy policy + Limited-Use + non-affiliation
  SIDELOAD.md                             # CREATE: Firefox/Edge install + sideload note (O3)
  manifest.json                           # MODIFY: host_permissions for OUR config host (Chrome)
  manifest.firefox.json                   # CREATE: Firefox MV3 variant (gecko id + scripts SW)
  manifest.edge.json                      # CREATE: Edge variant (Chromium-compatible)
  scripts/
    build.mjs                             # MODIFY: per-target manifest copy (chrome/firefox/edge)
  src/
    config.ts                             # CREATE: CONFIG_FLAG_URL constant (OUR host only)
    resilience/
      killswitch.ts                       # CREATE: isEnabled(): Promise<boolean> (§2.5, cached default-ON)
      killswitch.test.ts
      block-detect.ts                     # CREATE: 403/block classify => disable, never retry (§8.3)
      block-detect.test.ts
      contract-check.ts                   # CREATE: DOM self-check + failure counter + non-verdict banner + §8.3 block notice (§2.4, §8.1, §8.3)
      contract-check.test.ts
    entrypoints/
      content.ts                          # MODIFY (splice; never recreate): isEnabled() gate + block notice + §2.4 banner + §8.5 try/catch on the loop call sites
      background.ts                        # MODIFY: first-run trust-onboarding line on install (spec §7)
  tests/
    guard-ci.test.ts                      # MODIFY: extend — config host allowlisted, no CB fetch, no retry-on-CB-block
    packaging.test.ts                     # CREATE: all three manifests share CB host, declare OUR config host only
```

`crypto`, `fetch` (to OUR host only), and `chrome.storage` are used in app code. Tests mock `fetch` and `chrome` via `vi.stubGlobal`. Resilience pure logic (classification, counter, banner HTML) is unit-tested with Vitest + happy-dom; network behavior is tested with a stubbed `fetch` (never a real request).

---

## Task 1: OUR config host constant + the CI-guarded network boundary

The kill-switch must `fetch` exactly one URL on OUR host. Pinning it in one constant lets the CI guard (Task 7) assert nothing else issues a CB call and that this is the *only* network destination.

**Files:**
- Create: `extension/src/config.ts`, `extension/src/config.test.ts`, `extension/CONFIG_HOST.md`

- [ ] **Step 1: Write the failing test `extension/src/config.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { CONFIG_FLAG_URL, CONFIG_HOST } from './config';

describe('config host', () => {
  it('points at OUR host over https — never collegeboard.org', () => {
    const u = new URL(CONFIG_FLAG_URL);
    expect(u.protocol).toBe('https:');
    expect(u.hostname).toBe(CONFIG_HOST);
    expect(u.hostname).not.toMatch(/collegeboard\.org$/i);
    expect(CONFIG_FLAG_URL).not.toMatch(/qbank-api/i);
  });

  it('CONFIG_HOST is a bare hostname usable in manifest host_permissions', () => {
    expect(CONFIG_HOST).toMatch(/^[a-z0-9.-]+\.[a-z]{2,}$/i);
    expect(CONFIG_HOST).not.toContain('/');
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `cd extension && npx vitest run src/config.test.ts`
Expected: FAIL — cannot import from `./config` (module not found).

- [ ] **Step 3: Create `extension/src/config.ts`**

```ts
// OUR config host — the ONLY network destination the extension ever contacts.
// Static asset (a tiny JSON flag) on our own infrastructure. NEVER collegeboard.org, NEVER qbank-api.
// Hosted as an immutable-ish static file so a C&D / terms change can flip the overlay off instantly
// (spec §8.2) without users updating. Keep this hostname in sync with manifest host_permissions.
export const CONFIG_HOST = 'config.focusedpractice.app';
export const CONFIG_FLAG_URL = `https://${CONFIG_HOST}/v1/flags.json`;
```

- [ ] **Step 4: Create `extension/CONFIG_HOST.md`**

```md
# Config host

The extension contacts exactly ONE network endpoint: `https://config.focusedpractice.app/v1/flags.json`
(see `src/config.ts`). It is a tiny static JSON file on OUR infrastructure. It is NEVER a
collegeboard.org URL and NEVER the qbank-api.

## Flag shape

```json
{ "enabled": true }
```

- `enabled: true`  → overlay runs normally.
- `enabled: false` → overlay disables itself on next page load / next poll (the remote kill-switch,
  spec §8.2). Used for a C&D, a terms change, or a CB DOM break we can't hot-fix in time.

## Failure policy (default-ON)

If the fetch fails (offline, host down, CORS, non-200, malformed JSON, timeout), `isEnabled()`
returns the **last cached value**, or `true` if there is no cache. Default-ON means a flaky host
never bricks a paying-nothing student's local journal; the kill-switch is for *active* takedown,
which is an explicit `false`, not an absence.

## CORS

`flags.json` must be served with `Access-Control-Allow-Origin: *` (or the extension origin) so the
content-script `fetch` succeeds. It carries no credentials (`credentials: 'omit'`).
```

- [ ] **Step 5: Run it; verify it passes**

Run: `cd extension && npx vitest run src/config.test.ts`
Expected: PASS (2 passed).

- [ ] **Step 6: Commit**

```bash
git add extension/src/config.ts extension/src/config.test.ts extension/CONFIG_HOST.md
git commit -m "feat(extension): pin OUR config host (the only network destination; never CB)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Kill-switch — `isEnabled()` with cached default-ON (contract §2.5, spec §8.2)

`isEnabled()` is the §2.5 enablement gate Plan 4 owns entirely. It fetches OUR flag, caches the
result in `chrome.storage.local`, and **never throws** — any failure falls back to the cached value
or `true`. Plan 2/3 do NOT import or stub this (contract §2.5); Plan 4 inserts the gate (Task 8).

**Files:**
- Create: `extension/src/resilience/killswitch.ts`, `extension/src/resilience/killswitch.test.ts`

- [ ] **Step 1: Write the failing test `extension/src/resilience/killswitch.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isEnabled, CACHE_KEY } from './killswitch';
import { CONFIG_FLAG_URL } from '../config';

// In-memory chrome.storage.local stub.
function stubChrome() {
  const mem: Record<string, unknown> = {};
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: async (k: string) => (k in mem ? { [k]: mem[k] } : {}),
        set: async (o: Record<string, unknown>) => { Object.assign(mem, o); },
      },
    },
  });
  return mem;
}

beforeEach(() => { vi.unstubAllGlobals(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('isEnabled (kill-switch)', () => {
  it('returns true and caches it when the flag says enabled', async () => {
    const mem = stubChrome();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ enabled: true }), { status: 200 })));
    expect(await isEnabled()).toBe(true);
    expect(mem[CACHE_KEY]).toBe(true);
  });

  it('returns false when the flag explicitly disables (the takedown switch)', async () => {
    const mem = stubChrome();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ enabled: false }), { status: 200 })));
    expect(await isEnabled()).toBe(false);
    expect(mem[CACHE_KEY]).toBe(false);
  });

  it('fetches OUR config URL with no credentials — never a CB URL', async () => {
    stubChrome();
    const f = vi.fn(async () => new Response(JSON.stringify({ enabled: true }), { status: 200 }));
    vi.stubGlobal('fetch', f);
    await isEnabled();
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe(CONFIG_FLAG_URL);
    expect(String(url)).not.toMatch(/collegeboard\.org/i);
    expect((init as RequestInit).credentials).toBe('omit');
  });

  it('default-ON: network failure with no cache yields true (never throws)', async () => {
    stubChrome();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network down'); }));
    await expect(isEnabled()).resolves.toBe(true);
  });

  it('falls back to the cached value on failure (cached false stays false)', async () => {
    const mem = stubChrome();
    mem[CACHE_KEY] = false;
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    expect(await isEnabled()).toBe(false);
  });

  it('treats a non-200 or malformed body as a failure (falls back, never throws)', async () => {
    const mem = stubChrome();
    mem[CACHE_KEY] = true;
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 500 })));
    await expect(isEnabled()).resolves.toBe(true);
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `cd extension && npx vitest run src/resilience/killswitch.test.ts`
Expected: FAIL — `./killswitch` not found.

- [ ] **Step 3: Create `extension/src/resilience/killswitch.ts`**

```ts
import { CONFIG_FLAG_URL } from '../config';

// §2.5 enablement gate (Plan 4 owns). Fetches OUR hosted flag; caches in chrome.storage.local;
// NEVER throws. Default-ON: a flaky/absent host must not brick the local journal — the kill-switch
// only fires on an EXPLICIT { enabled: false } from us (spec §8.2 C&D / terms change).
export const CACHE_KEY = 'killswitch.enabled';
const TIMEOUT_MS = 4000;

async function readCache(): Promise<boolean | undefined> {
  try {
    const got = await chrome.storage.local.get(CACHE_KEY);
    const v = (got as Record<string, unknown>)[CACHE_KEY];
    return typeof v === 'boolean' ? v : undefined;
  } catch {
    return undefined;
  }
}

async function writeCache(v: boolean): Promise<void> {
  try { await chrome.storage.local.set({ [CACHE_KEY]: v }); } catch { /* cache best-effort */ }
}

export async function isEnabled(): Promise<boolean> {
  const cached = await readCache();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(CONFIG_FLAG_URL, { credentials: 'omit', signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return cached ?? true;
    const body = (await res.json()) as { enabled?: unknown };
    if (typeof body.enabled !== 'boolean') return cached ?? true;
    await writeCache(body.enabled);
    return body.enabled;
  } catch {
    return cached ?? true;
  }
}
```

- [ ] **Step 4: Run it; verify it passes**

Run: `cd extension && npx vitest run src/resilience/killswitch.test.ts`
Expected: PASS (6 passed) — enabled, disabled, OUR-URL-with-omit, default-ON-no-cache, cached-false, non-200-fallback.

- [ ] **Step 5: Commit**

```bash
git add extension/src/resilience/killswitch.ts extension/src/resilience/killswitch.test.ts
git commit -m "feat(extension): kill-switch isEnabled() — hosted flag, cached default-ON, never throws

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Block detection — 403/CB-block => disable, never retry (spec §8.3)

On a CB block signal (a 403/429/451 status surfaced via the DOM, or a known block-page marker), we
**disable the overlay and point the user to CB directly. We never retry and never call the API**
(contract §0, spec §8.3). This module is pure classification + a disable action; it issues **no**
network request of its own.

**Files:**
- Create: `extension/src/resilience/block-detect.ts`, `extension/src/resilience/block-detect.test.ts`

- [ ] **Step 1: Write the failing test `extension/src/resilience/block-detect.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import { detectBlock, isBlockStatus, BLOCK_REASON } from './block-detect';

describe('block detection', () => {
  it('classifies CB block HTTP statuses', () => {
    expect(isBlockStatus(403)).toBe(true);
    expect(isBlockStatus(429)).toBe(true);
    expect(isBlockStatus(451)).toBe(true);
    expect(isBlockStatus(200)).toBe(false);
    expect(isBlockStatus(404)).toBe(false);
  });

  it('detects a block-page marker in the document and returns a reason (no retry implied)', () => {
    document.body.innerHTML = '<div id="app">Access Denied — Reference #18.abcd</div>';
    expect(detectBlock(document)).toBe(BLOCK_REASON.ACCESS_DENIED);
  });

  it('detects an explicit forbidden status echoed into the page', () => {
    document.body.innerHTML = '<h1>403 Forbidden</h1>';
    expect(detectBlock(document)).toBe(BLOCK_REASON.FORBIDDEN);
  });

  it('returns null when the page is a normal CB results page', () => {
    document.body.innerHTML = '<div role="dialog">Question ID: ab12cd34</div>';
    expect(detectBlock(document)).toBeNull();
  });

  it('never issues a network request while detecting', () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    document.body.innerHTML = '<h1>403 Forbidden</h1>';
    detectBlock(document);
    expect(f).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `cd extension && npx vitest run src/resilience/block-detect.test.ts`
Expected: FAIL — `./block-detect` not found.

- [ ] **Step 3: Create `extension/src/resilience/block-detect.ts`**

```ts
// CB block detection (spec §8.3). On a block signal we DISABLE and point to CB. We NEVER retry,
// NEVER enumerate, NEVER call the API. This module only READS the already-rendered page — it issues
// no network request of its own. Akamai/CB block pages surface as 403/429/451 or an access-denied marker.
export const BLOCK_REASON = {
  ACCESS_DENIED: 'access-denied',
  FORBIDDEN: 'forbidden',
  RATE_LIMITED: 'rate-limited',
} as const;
export type BlockReason = (typeof BLOCK_REASON)[keyof typeof BLOCK_REASON];

const BLOCK_STATUSES = new Set([403, 429, 451]);
export function isBlockStatus(status: number): boolean {
  return BLOCK_STATUSES.has(status);
}

// Read-only DOM classification. Returns a reason if this rendered page is a CB block page, else null.
export function detectBlock(doc: Document): BlockReason | null {
  const text = (doc.body?.textContent ?? '').slice(0, 4000); // bounded read; never persisted
  if (/access denied/i.test(text)) return BLOCK_REASON.ACCESS_DENIED;
  if (/\b403\b\s*forbidden/i.test(text)) return BLOCK_REASON.FORBIDDEN;
  if (/\b429\b|too many requests/i.test(text)) return BLOCK_REASON.RATE_LIMITED;
  if (/\b451\b/.test(text)) return BLOCK_REASON.FORBIDDEN;
  return null;
}
```

- [ ] **Step 4: Run it; verify it passes**

Run: `cd extension && npx vitest run src/resilience/block-detect.test.ts`
Expected: PASS (5 passed) — including that detection issues no `fetch`.

- [ ] **Step 5: Commit**

```bash
git add extension/src/resilience/block-detect.ts extension/src/resilience/block-detect.test.ts
git commit -m "feat(extension): CB block detection — classify 403/429/451 + page markers, never retry

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: DOM-contract self-check + failure counter (spec §8.1, contract §2.4)

Before the loop trusts a `QuestionView`, verify CB's expected nodes are present. On extraction
failure we **never guess a score** — we bump a local failure counter and the caller shows the
non-verdict banner (Task 5). This is the §2.4 enrichment Plan 4 layers onto Plan 2's indeterminate
state. The counter persists to `chrome.storage.local` so repeated breakage is observable (feeds the
kill-switch decision, spec §8.1/§8.2).

**Files:**
- Create: `extension/src/resilience/contract-check.ts`, `extension/src/resilience/contract-check.test.ts`

- [ ] **Step 1: Write the failing test `extension/src/resilience/contract-check.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkContract, bumpFailureCounter, FAILURE_KEY } from './contract-check';
import type { QuestionView } from '../cb/reader';

function stubChrome() {
  const mem: Record<string, unknown> = {};
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: async (k: string) => (k in mem ? { [k]: mem[k] } : {}),
        set: async (o: Record<string, unknown>) => { Object.assign(mem, o); },
      },
    },
  });
  return mem;
}

const ok: QuestionView = {
  id: 'ab12cd34', section: 'Math', domain: 'Algebra', skill: 'Linear equations', difficulty: 'Hard',
  stem: 'stem', choices: [{ letter: 'A', text: '3' }, { letter: 'B', text: '5' }],
  correctAnswer: 'B', explanation: 'because',
};

beforeEach(() => { vi.unstubAllGlobals(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('checkContract', () => {
  it('passes a well-formed multiple-choice view', () => {
    expect(checkContract(ok)).toEqual({ ok: true });
  });

  it('passes a grid-in view (no choices) that still has id + answer', () => {
    expect(checkContract({ ...ok, choices: [], correctAnswer: '5' })).toEqual({ ok: true });
  });

  it('fails when readQuestion returned null (unreadable)', () => {
    expect(checkContract(null)).toEqual({ ok: false, reason: 'unreadable' });
  });

  it('fails when the id is missing/empty', () => {
    expect(checkContract({ ...ok, id: '' })).toEqual({ ok: false, reason: 'missing-id' });
  });

  it('fails when there are neither choices nor a correct answer (cannot score or display)', () => {
    expect(checkContract({ ...ok, choices: [], correctAnswer: null })).toEqual({ ok: false, reason: 'no-answerable-content' });
  });
});

describe('bumpFailureCounter', () => {
  it('increments and persists the failure count', async () => {
    const mem = stubChrome();
    expect(await bumpFailureCounter()).toBe(1);
    expect(await bumpFailureCounter()).toBe(2);
    expect(mem[FAILURE_KEY]).toBe(2);
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `cd extension && npx vitest run src/resilience/contract-check.test.ts`
Expected: FAIL — `./contract-check` not found.

- [ ] **Step 3: Create `extension/src/resilience/contract-check.ts`**

```ts
import type { QuestionView } from '../cb/reader';

// DOM-contract self-check (spec §8.1, contract §2.4). Verifies CB's expected data is present on a
// read view BEFORE the loop trusts it. On failure we NEVER guess a score — the caller degrades to
// the non-verdict banner (renderBanner) and bumps the persisted failure counter. A wrong right/wrong
// is the trust-killer; this gate ensures we only score what we could fully read.
export type ContractResult =
  | { ok: true }
  | { ok: false; reason: 'unreadable' | 'missing-id' | 'no-answerable-content' };

export function checkContract(view: QuestionView | null): ContractResult {
  if (view === null) return { ok: false, reason: 'unreadable' };
  if (!view.id || view.id.trim() === '') return { ok: false, reason: 'missing-id' };
  // We can present a question if it has choices (MC) OR a revealed correct answer (grid-in).
  if (view.choices.length === 0 && (view.correctAnswer === null || view.correctAnswer.trim() === '')) {
    return { ok: false, reason: 'no-answerable-content' };
  }
  return { ok: true };
}

export const FAILURE_KEY = 'contract.failureCount';

// Persisted, monotonically increasing failure tally. Observable signal that CB's DOM drifted —
// feeds the kill-switch decision (spec §8.1/§8.2). Best-effort; never throws.
export async function bumpFailureCounter(): Promise<number> {
  try {
    const got = await chrome.storage.local.get(FAILURE_KEY);
    const prev = (got as Record<string, unknown>)[FAILURE_KEY];
    const next = (typeof prev === 'number' ? prev : 0) + 1;
    await chrome.storage.local.set({ [FAILURE_KEY]: next });
    return next;
  } catch {
    return 0;
  }
}
```

- [ ] **Step 4: Run it; verify it passes**

Run: `cd extension && npx vitest run src/resilience/contract-check.test.ts`
Expected: PASS (6 passed) — MC ok, grid-in ok, unreadable, missing-id, no-answerable-content, counter increments.

- [ ] **Step 5: Commit**

```bash
git add extension/src/resilience/contract-check.ts extension/src/resilience/contract-check.test.ts
git commit -m "feat(extension): DOM-contract self-check + persisted failure counter (never-guess)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: The non-verdict degraded banner + the "use CB directly" block notice — Shadow DOM + TrustedHTML (contract §2.4, spec §8.3/§8.4)

Two non-verdict notices mount inside the **single** shadow host from Plan 2 (`mountHost` / `HOST_ID` /
`TT_POLICY`), both routing **all** `innerHTML` through Plan 2's `html()` helper (contract §2.1, spec §8.4):

- `renderBanner(root)` — the per-question "Couldn't read this one — answer it on CB" degraded banner (§2.4).
- `renderBlockNotice(root)` — the §8.3 "use CB directly" notice shown when block-detection fires (we
  **disable and point the student to CB** — never retry, never call the API). It is NOT dismissible
  (the overlay is disabled for this page) and it is non-verdict by construction.

Both show **no red/green**, are idempotent (one of each at a time), and use no scoring colors.

**Files:**
- Modify: `extension/src/resilience/contract-check.ts`, `extension/src/resilience/contract-check.test.ts`

- [ ] **Step 1: Extend the failing test in `extension/src/resilience/contract-check.test.ts`**

Append these imports + `describe` block to the existing test file:

```ts
import { renderBanner, BANNER_ID, renderBlockNotice, BLOCK_NOTICE_ID } from './contract-check';
import { mountHost } from '../ui/host';

describe('renderBanner (non-verdict degraded state)', () => {
  it('mounts one dismissible banner inside the shadow host with no red/green verdict', () => {
    document.body.innerHTML = '';
    const root = mountHost(document);
    renderBanner(root);

    const banner = root.getElementById(BANNER_ID)!;
    expect(banner).not.toBeNull();
    expect(banner.textContent).toContain("Couldn't read this one");
    expect(banner.textContent).toMatch(/answer it on CB/i);
    // non-verdict: no scoring colors anywhere in the banner
    expect(banner.querySelector('.correct')).toBeNull();
    expect(banner.querySelector('.incorrect')).toBeNull();

    // idempotent: a second render does not stack a duplicate
    renderBanner(root);
    expect(root.querySelectorAll(`#${BANNER_ID}`)).toHaveLength(1);

    // dismissible
    banner.querySelector<HTMLButtonElement>('[data-action="dismiss"]')!.click();
    expect(root.getElementById(BANNER_ID)).toBeNull();
  });
});

describe('renderBlockNotice (§8.3 — disable AND point to CB)', () => {
  it('mounts one non-verdict notice telling the student to use CB directly', () => {
    document.body.innerHTML = '';
    const root = mountHost(document);
    renderBlockNotice(root);

    const notice = root.getElementById(BLOCK_NOTICE_ID)!;
    expect(notice).not.toBeNull();
    expect(notice.textContent).toMatch(/use the question bank directly on CB|answer .* directly on CB/i);
    // non-verdict: no scoring colors
    expect(notice.querySelector('.correct')).toBeNull();
    expect(notice.querySelector('.incorrect')).toBeNull();
    // links the student to CB's own page (we point them there; we never retry/enumerate)
    const link = notice.querySelector<HTMLAnchorElement>('a[href]')!;
    expect(link.href).toMatch(/satsuiteeducatorquestionbank\.collegeboard\.org/i);

    // idempotent: a second render does not stack a duplicate
    renderBlockNotice(root);
    expect(root.querySelectorAll(`#${BLOCK_NOTICE_ID}`)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `cd extension && npx vitest run src/resilience/contract-check.test.ts`
Expected: FAIL — `renderBanner` / `BANNER_ID` / `renderBlockNotice` / `BLOCK_NOTICE_ID` are not exported from `./contract-check`.

- [ ] **Step 3: Add `renderBanner` + `BANNER_ID` to `extension/src/resilience/contract-check.ts`**

Append to the file. It routes **all** `innerHTML` through Plan 2's `html()` helper — the ONE place
`host.ts` already created the single `focused-practice` policy (contract §2.1, spec §8.4). It does NOT
call `trustedTypes.createPolicy` again: a second `createPolicy('focused-practice', …)` throws in real
Trusted-Types engines. Reusing `html()` is the design intent — the banner goes through the same one host policy.

```ts
import { html } from '../ui/host';

export const BANNER_ID = 'fp-degraded-banner';

// Non-verdict degraded banner (contract §2.4). Shows CB's own page is authoritative here; renders
// NO red/green. Idempotent + dismissible. Mounts inside the single shadow host (HOST_ID). All HTML
// goes through Plan 2's `html()` — the SINGLE `focused-practice` policy created once in host.ts;
// we never re-create the policy here (contract §2.1: ONE policy, created in host.ts).
export function renderBanner(root: ShadowRoot): void {
  if (root.getElementById(BANNER_ID)) return; // idempotent
  const el = root.ownerDocument!.createElement('div');
  el.id = BANNER_ID;
  el.setAttribute('role', 'status');
  el.innerHTML = html(`
    <div class="fp-banner">
      <span class="fp-banner-text">Couldn't read this one — answer it on CB.</span>
      <button type="button" data-action="dismiss" class="fp-banner-dismiss" aria-label="Dismiss">×</button>
    </div>`) as string;
  el.querySelector<HTMLButtonElement>('[data-action="dismiss"]')!.addEventListener('click', () => el.remove());
  root.appendChild(el);
}

export const BLOCK_NOTICE_ID = 'fp-block-notice';

// §8.3 "disable AND point to CB" notice. Shown when block-detection fires: the overlay disables
// itself for this page and tells the student to use CB's question bank directly. We NEVER retry,
// NEVER call the API — we just link them to CB's own page. Non-verdict; not dismissible (the overlay
// is off for this page). Idempotent. HTML goes through Plan 2's single `html()` policy.
export function renderBlockNotice(root: ShadowRoot): void {
  if (root.getElementById(BLOCK_NOTICE_ID)) return; // idempotent
  const el = root.ownerDocument!.createElement('div');
  el.id = BLOCK_NOTICE_ID;
  el.setAttribute('role', 'status');
  el.innerHTML = html(`
    <div class="fp-banner">
      <span class="fp-banner-text">Focused Practice is paused on this page. Use the question bank directly on CB:</span>
      <a class="fp-banner-link" href="https://satsuiteeducatorquestionbank.collegeboard.org/" target="_blank" rel="noopener noreferrer">Open the College Board question bank</a>
    </div>`) as string;
  root.appendChild(el);
}
```

- [ ] **Step 4: Run it; verify it passes**

Run: `cd extension && npx vitest run src/resilience/contract-check.test.ts`
Expected: PASS (8 passed) — the banner test + the block-notice test plus the 6 from Task 4.

- [ ] **Step 5: Commit**

```bash
git add extension/src/resilience/contract-check.ts extension/src/resilience/contract-check.test.ts
git commit -m "feat(extension): non-verdict 'answer it on CB' banner + '§8.3 use CB directly' block notice (TrustedHTML)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Manifest host_permissions for OUR config host + Firefox/Edge variants (spec §11 O3, §12.5)

Add OUR config host (and only OUR host) to `host_permissions`, alongside the existing CB content
match. Provide Firefox and Edge manifest variants so an IP complaint can't delist us off every store
at once (spec §11 O3). The CB host stays identical across all three.

**Files:**
- Modify: `extension/manifest.json`
- Create: `extension/manifest.firefox.json`, `extension/manifest.edge.json`

- [ ] **Step 1: Modify `extension/manifest.json` (Chrome) — add OUR config host**

Replace the `host_permissions` line. Current:
```json
  "host_permissions": ["*://satsuiteeducatorquestionbank.collegeboard.org/*"],
```
New (CB content match unchanged; OUR config host added — nothing else):
```json
  "host_permissions": [
    "*://satsuiteeducatorquestionbank.collegeboard.org/*",
    "https://config.focusedpractice.app/*"
  ],
```

- [ ] **Step 2: Create `extension/manifest.firefox.json` (Firefox MV3 variant)**

```json
{
  "manifest_version": 3,
  "name": "Focused Practice (dev)",
  "version": "0.0.1",
  "description": "A study companion that adds scoring, a mistake journal, and a calculator on top of the official SAT question bank. Not affiliated with, authorized, or endorsed by College Board; SAT is a trademark of the College Board.",
  "browser_specific_settings": { "gecko": { "id": "focused-practice@focusedpractice.app", "strict_min_version": "121.0" } },
  "permissions": ["storage"],
  "host_permissions": [
    "*://satsuiteeducatorquestionbank.collegeboard.org/*",
    "https://config.focusedpractice.app/*"
  ],
  "background": { "scripts": ["background.js"] },
  "content_scripts": [
    {
      "matches": ["*://satsuiteeducatorquestionbank.collegeboard.org/*"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "action": { "default_title": "Focused Practice" }
}
```

(Firefox MV3 uses `background.scripts`, not `service_worker`, and requires a `gecko` id.)

- [ ] **Step 3: Create `extension/manifest.edge.json` (Edge variant)**

```json
{
  "manifest_version": 3,
  "name": "Focused Practice (dev)",
  "version": "0.0.1",
  "description": "A study companion that adds scoring, a mistake journal, and a calculator on top of the official SAT question bank. Not affiliated with, authorized, or endorsed by College Board; SAT is a trademark of the College Board.",
  "permissions": ["storage"],
  "host_permissions": [
    "*://satsuiteeducatorquestionbank.collegeboard.org/*",
    "https://config.focusedpractice.app/*"
  ],
  "background": { "service_worker": "background.js" },
  "content_scripts": [
    {
      "matches": ["*://satsuiteeducatorquestionbank.collegeboard.org/*"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "action": { "default_title": "Focused Practice" }
}
```

(Edge is Chromium — same service-worker background as Chrome; a distinct file keeps store-listing
metadata independent.)

- [ ] **Step 4: Sanity-check all three manifests parse as JSON**

Run:
```bash
cd extension && node -e "for (const m of ['manifest.json','manifest.firefox.json','manifest.edge.json']) { JSON.parse(require('fs').readFileSync(m,'utf8')); console.log(m, 'OK'); }"
```
Expected:
```
manifest.json OK
manifest.firefox.json OK
manifest.edge.json OK
```

- [ ] **Step 5: Commit**

```bash
git add extension/manifest.json extension/manifest.firefox.json extension/manifest.edge.json
git commit -m "feat(extension): add OUR config host to host_permissions; Firefox + Edge variants

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Extend (NOT duplicate) the legal CI guard (Plan 1 Task 8; spec §9, §10)

Harden the existing `extension/tests/guard-ci.test.ts`. Now that Plan 4 introduces a (single,
OUR-host) `fetch`, the guard must assert: (a) no source file fetches `collegeboard.org`; (b) the only
fetched literal URL is OUR config URL; (c) no source contains a retry-loop aimed at a CB block (no
"retry"/"while"+`collegeboard.org` shape). We extend the same file — we do not add a second guard.

**Files:**
- Modify: `extension/tests/guard-ci.test.ts`

- [ ] **Step 1: Read the current guard then add the new assertions**

Read `extension/tests/guard-ci.test.ts`. After the existing `FETCH_TO_CB` constant, add the extra
patterns and a new per-file assertion block plus one config-host whitelist test. Insert this constant
group after line `const FETCH_TO_CB = ...`:

```ts
// Plan 4 hardening: the kill-switch may fetch OUR host ONLY. Any other fetched http(s) literal that
// is NOT our config host is a violation. We also forbid any "retry on CB block" shape (spec §8.3:
// on a block we DISABLE, never retry).
const OUR_CONFIG_HOST = 'config.focusedpractice.app';
const FETCH_LITERAL = /fetch\(\s*[`'"]([^`'"]+)[`'"]/g;           // each fetched string literal
const RETRY_ON_CB = /(retry|while\s*\([^)]*\)|for\s*\([^)]*\))[^\n;]*collegeboard\.org/i;
```

Then add these two assertions inside the existing `for (const file of files)` loop body, after the
two existing `expect(...)` lines:

```ts
      // (a) every fetched literal URL must be OUR config host (or a relative/extension URL)
      for (const m of code.matchAll(FETCH_LITERAL)) {
        const target = m[1]!;
        if (/^https?:\/\//i.test(target)) {
          expect(target, `fetch target ${target} must be OUR config host`).toContain(OUR_CONFIG_HOST);
          expect(target, 'must never fetch collegeboard.org').not.toMatch(/collegeboard\.org/i);
        }
      }
      // (b) no retry/loop pointed at a CB block (spec §8.3 — disable, never retry)
      expect(code, 'must not retry against collegeboard.org').not.toMatch(RETRY_ON_CB);
```

And add one standalone test after the loop (asserting the kill-switch's single allowed destination is
actually present, so the guard can't pass by the codebase simply having no fetch at all once Plan 4
ships):

```ts
  it('the kill-switch fetches exactly OUR config host (allowlist is non-vacuous)', () => {
    const ks = readFileSync(join(SRC, 'resilience', 'killswitch.ts'), 'utf8');
    expect(ks, 'killswitch must fetch via the config constant').toMatch(/CONFIG_FLAG_URL/);
    expect(ks, 'killswitch must not hardcode a CB URL').not.toMatch(/collegeboard\.org/i);
  });
```

- [ ] **Step 2: Run it; verify it passes on the clean tree**

Run: `cd extension && npx vitest run tests/guard-ci.test.ts`
Expected: PASS — every src file clean; the kill-switch allowlist test passes (it references `CONFIG_FLAG_URL`, no CB URL).

- [ ] **Step 3: Prove the extended guard fails on a violation (temporary probe)**

Temporarily create `extension/src/__violation_probe.ts`:
```ts
export const oops = () => fetch('https://api.collegeboard.org/x');
export const loopy = async () => { while (true) await fetch('https://x.collegeboard.org/retry'); };
```
Run: `cd extension && npx vitest run tests/guard-ci.test.ts`
Expected: FAIL on `src/__violation_probe.ts` — the fetched-literal-not-OUR-host assertion AND the
retry-on-CB assertion both fire. Then delete the probe:
```bash
rm extension/src/__violation_probe.ts
```
Re-run; expected: PASS again.

- [ ] **Step 4: Commit**

```bash
git add extension/tests/guard-ci.test.ts
git commit -m "test(extension): extend legal CI guard — fetch allowlist (OUR host) + no-retry-on-CB

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Splice the §2.5 gate + §8.3 block notice + §2.4 degraded path + §8.5 try/catch into the EXISTING content.ts

This is the integration Plan 2/3 deliberately left open (contract §2.4, §2.5). **We do NOT recreate
`content.ts`.** Plan 2 created `runLoop` (start panel, scoring, `recordAttempt`/`saveNote`/`saveSession`,
calculator, §2.3 session writes); Plan 3 added `refreshBadges`/`mountPanelToggle`/`handleMessage`
(badger + journal panel) and a bootstrap block. Plan 4 makes **four surgical edits** to that
post-Plan-3 file — every Plan 2/3 export and call site is preserved verbatim:

1. **§2.5 + §8.3 gate** — wrap the bootstrap's `runLoop(...)` mount (and the badger/panel wiring) in a
   `guardedStart(...)` that returns early when `isEnabled()` is false, and mounts the §8.3 `renderBlockNotice`
   (then returns) when `detectBlock(document) !== null`. It never retries, never calls the API.
2. **§2.4 degraded path** — inside Plan 2's `showQuestion(view)`, gate on `checkContract(view)`: on
   failure call `renderBanner(shadow)` + `bumpFailureCounter()` and **return before** `renderCard(...)`;
   on success fall through to Plan 2's existing 4-arg `renderCard(shadow, toCardVM(...), live, handlers)`
   call — unchanged.
3. **§8.5 graceful degradation** — wrap the IndexedDB writes Plan 2 makes (`recordAttempt`,
   `saveNote`, `saveSession`) in a `safeWrite(...)` helper so an IndexedDB write failure leaves the
   session working but **untracked** (spec §8.5) instead of throwing into the loop.
4. A `handleQuestion(shadow, view, renderQuestion)` helper is **extracted** to make edit #2
   unit-testable; `renderQuestion` is a zero-arg thunk that runs Plan 2's existing `renderCard(...)`
   closure — Plan 4 never re-calls `renderCard` with a different signature.

> **Splice instruction (exact, against the post-Plan-3 file).** The post-Plan-3 `content.ts` exports
> `runLoop` (Plan 2 Task 7), `findResultsList`/`refreshBadges`/`mountPanelToggle`/`handleMessage`
> (Plan 3 Tasks 6/8), and ends with a `if (typeof chrome !== 'undefined' && chrome.runtime?.id) { … }`
> bootstrap IIFE. Make the four edits below to *that* file. Add the new imports at the top; add
> `handleQuestion`, `guardedStart`, `safeWrite` as new exports; change the bootstrap IIFE to call
> `guardedStart`; and change the two lines inside Plan 2's `showQuestion`/write call sites as shown.
> Do not delete `runLoop`, the session writes, the badger, the panel, or `handleMessage`.

**Files:**
- Modify: `extension/src/entrypoints/content.ts`
- Modify: `extension/src/entrypoints/content.test.ts` (created by Plan 2 Task 7 / extended by Plan 3 Tasks 6/8 — **append**, do not recreate)

- [ ] **Step 1: Append the failing Plan-4 suite to `extension/src/entrypoints/content.test.ts`**

`content.test.ts` already exists from Plan 2/3 (loop wiring, badger, panel, `handleMessage`). **Append**
this `describe` block + the imports it needs; do NOT overwrite the Plan 2/3 suites. These specs target
only the three new exports (`handleQuestion`, `guardedStart`, `safeWrite`) and mock the resilience
modules so they do not touch the network or a real store.

```ts
// --- Plan 4: resilience gate + degraded path (appended; Plan 2/3 suites above are untouched) ---
import { handleQuestion, guardedStart, safeWrite } from './content';
import { isEnabled } from '../resilience/killswitch';
import { detectBlock } from '../resilience/block-detect';
import { BLOCK_NOTICE_ID } from '../resilience/contract-check';
import { mountHost } from '../ui/host';
import * as contract from '../resilience/contract-check';

vi.mock('../resilience/killswitch', () => ({ isEnabled: vi.fn() }));
vi.mock('../resilience/block-detect', () => ({ detectBlock: vi.fn(() => null), BLOCK_REASON: {} }));

describe('content bootstrap gate (§2.5 / §8.3)', () => {
  // Use the REAL Plan 2 mountHost here (not mocked) so we can assert the §8.3 notice actually lands
  // in the single shadow host; only the resilience inputs are mocked.
  beforeEach(() => { vi.clearAllMocks(); document.body.innerHTML = ''; });

  it('does NOT run the loop when the kill-switch is disabled', async () => {
    (isEnabled as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const runner = vi.fn(async () => {});
    await guardedStart(document, runner);
    expect(runner).not.toHaveBeenCalled();
    expect(mountHost(document).getElementById(BLOCK_NOTICE_ID)).toBeNull(); // nothing mounted
  });

  it('does NOT run the loop on a CB block — it mounts the §8.3 "use CB directly" notice instead', async () => {
    (isEnabled as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (detectBlock as ReturnType<typeof vi.fn>).mockReturnValue('forbidden');
    const runner = vi.fn(async () => {});

    await guardedStart(document, runner);

    expect(runner).not.toHaveBeenCalled();   // disable, never retry, never call the API
    // §8.3: the real renderBlockNotice mounted a non-verdict "use CB directly" notice in the host
    const notice = mountHost(document).getElementById(BLOCK_NOTICE_ID)!;
    expect(notice).not.toBeNull();
    expect(notice.textContent).toMatch(/use the question bank directly on CB/i);
  });

  it('runs the loop when enabled and not blocked', async () => {
    (isEnabled as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (detectBlock as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const runner = vi.fn(async () => {});
    await guardedStart(document, runner);
    expect(runner).toHaveBeenCalledTimes(1);
    expect(mountHost(document).getElementById(BLOCK_NOTICE_ID)).toBeNull(); // no block notice on the happy path
  });
});

describe('per-question degraded path (§2.4)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders the banner + bumps the counter on a failed contract check, and does NOT render the card', async () => {
    const shadow = {} as ShadowRoot;
    const renderQuestion = vi.fn();
    const banner = vi.spyOn(contract, 'renderBanner').mockImplementation(() => {});
    const bump = vi.spyOn(contract, 'bumpFailureCounter').mockResolvedValue(1);
    vi.spyOn(contract, 'checkContract').mockReturnValue({ ok: false, reason: 'unreadable' });

    await handleQuestion(shadow, null, renderQuestion);

    expect(banner).toHaveBeenCalledWith(shadow);
    expect(bump).toHaveBeenCalledTimes(1);
    expect(renderQuestion).not.toHaveBeenCalled();   // never render a card we couldn't fully read
  });

  it('runs Plan 2\'s renderQuestion thunk (not the banner) when the contract check passes', async () => {
    const shadow = {} as ShadowRoot;
    const renderQuestion = vi.fn();
    const banner = vi.spyOn(contract, 'renderBanner').mockImplementation(() => {});
    vi.spyOn(contract, 'checkContract').mockReturnValue({ ok: true });

    await handleQuestion(shadow, view, renderQuestion);

    expect(renderQuestion).toHaveBeenCalledTimes(1);  // Plan 2's existing renderCard(shadow, vm, live, handlers) call
    expect(banner).not.toHaveBeenCalled();
  });
});

describe('§8.5 graceful degradation — IndexedDB write failure leaves the session working, untracked', () => {
  it('safeWrite swallows an IndexedDB write rejection (never throws into the loop)', async () => {
    await expect(safeWrite(Promise.reject(new Error('IDB write failed')))).resolves.toBeUndefined();
  });

  it('safeWrite resolves through a successful write', async () => {
    await expect(safeWrite(Promise.resolve())).resolves.toBeUndefined();
  });
});
```

(`view` here is a `QuestionView` fixture already declared by the Plan 2/3 suites in this file; if the
existing suites use a different fixture name, reference that one — do not redeclare it.)

- [ ] **Step 2: Run it; verify the appended specs fail**

Run: `cd extension && npx vitest run src/entrypoints/content.test.ts`
Expected: FAIL — `content.ts` does not yet export `handleQuestion` / `guardedStart` / `safeWrite`
(`renderBlockNotice` not yet wired). The Plan 2/3 suites still pass.

- [ ] **Step 3: Make the four surgical edits to `extension/src/entrypoints/content.ts`**

**Edit 3a — add the Plan-4 imports** at the top of the file (alongside Plan 2/3's existing imports;
do not remove any existing import):

```ts
import { isEnabled } from '../resilience/killswitch';    // Plan 4 (§2.5)
import { detectBlock } from '../resilience/block-detect';// Plan 4 (§8.3)
import { checkContract, renderBanner, renderBlockNotice, bumpFailureCounter } from '../resilience/contract-check'; // Plan 4 (§2.4/§8.3)
```

**Edit 3b — add three new exported helpers** (place them near the top of the module body, after the
imports; they reference only symbols already imported):

```ts
// §8.5 graceful degradation: an IndexedDB write failure must leave the session WORKING but untracked,
// never throw into the loop. Wrap each Plan 2 store write (recordAttempt / saveNote / saveSession) in this.
export async function safeWrite(write: Promise<unknown>): Promise<void> {
  try { await write; } catch { /* §8.5: session works, this datum is just untracked */ }
}

// §2.4 degraded path, extracted from Plan 2's showQuestion so it is unit-testable. On a failed
// contract check we show the non-verdict banner + bump the failure counter and DO NOT render the card.
// `renderQuestion` is Plan 2's existing renderCard(shadow, toCardVM(view), live, handlers) closure —
// Plan 4 never re-calls renderCard with a different signature.
export async function handleQuestion(
  shadow: ShadowRoot,
  view: QuestionView | null,
  renderQuestion: () => void,
): Promise<void> {
  if (!checkContract(view).ok) {
    renderBanner(shadow);
    await bumpFailureCounter();
    return;
  }
  renderQuestion(); // contract passed → run Plan 2's existing 4-arg renderCard call site unchanged
}

// §2.5 + §8.3 gate that wraps Plan 2/3's start. `runner` is the post-Plan-3 startup body (runLoop +
// badger + panel toggle + handleMessage listener). Disabled flag → mount nothing. CB block → mount
// the §8.3 "use CB directly" notice and return; never retry, never call the API.
export async function guardedStart(doc: Document, runner: () => Promise<void>): Promise<void> {
  if (!(await isEnabled())) return;                 // §2.5: hosted kill-switch off
  if (detectBlock(doc) !== null) {                  // §8.3: CB block
    renderBlockNotice(mountHost(doc));              // disable AND point the student to CB
    return;
  }
  await runner();
}
```

**Edit 3c — route Plan 2's `showQuestion(view)` through `handleQuestion`.** In Plan 2's `runLoop`,
the body of `showQuestion` builds `live`/`handlers` and ends with
`renderCard(shadow, toCardVM(view, index, index + 1), live, handlers);`. Wrap that final paint in the
contract gate by passing it as the `renderQuestion` thunk — replace the single `renderCard(...)` call
with:

```ts
    // §2.4: only paint the card when the DOM contract holds; otherwise degrade to the banner.
    void handleQuestion(shadow, view, () =>
      renderCard(shadow, toCardVM(view, index, index + 1), live, handlers),
    );
```

(Everything above it in `showQuestion` — `live`, `handlers`, `toCardVM` — is unchanged; the only change
is that the final `renderCard(...)` is now the thunk handed to `handleQuestion`.)

**Edit 3d — wrap Plan 2's store writes in `safeWrite` (§8.5)** and gate the bootstrap on `guardedStart`.
In `runLoop`, change the three write sites to best-effort:

```ts
    void safeWrite(saveSession(db, session));                                    // in start()
    // ...
        if (text) void safeWrite(saveNote(db, makeNote({ deviceId: dev, questionId: view.id, text }))); // in onNote
    // ...
      await safeWrite(recordAttempt(db, makeAttempt({ /* …unchanged… */ })));    // in onCheck
    // ...
      await safeWrite(saveSession(db, session));                                 // in onNext
```

Then change the **bootstrap IIFE** so the whole post-Plan-3 startup body runs through the gate. Plan 3
left it as `if (typeof chrome !== 'undefined' && chrome.runtime?.id) { void (async () => { … })(); }`.
Wrap that body in `guardedStart` (the `runLoop` mount, the badger, the panel toggle, and the
`onMessage` listener all move INSIDE the runner — none are removed):

```ts
if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
  void guardedStart(document, async () => {
    const db = await openStore();
    await runLoop(document, db, deviceId());                 // Plan 2 loop (start panel, scoring, session)
    mountPanelToggle(document, () => void handleMessage(db, { type: 'open-journal' })); // Plan 3
    const list = findResultsList(document);                  // Plan 3 badger
    if (list) await refreshBadges(db, list);
    observeQuestions(document, () => {
      const l = findResultsList(document);
      if (l) void refreshBadges(db, l);
    });
    chrome.runtime.onMessage.addListener((m: { type?: string }) => { void handleMessage(db, m); }); // Plan 3 popup
  });
}
```

- [ ] **Step 4: Run it; verify the whole content suite passes**

Run: `cd extension && npx vitest run src/entrypoints/content.test.ts`
Expected: PASS — the Plan 2/3 suites (loop wiring, never-guess, note/Next, badger, panel,
`handleMessage`) **plus** the appended Plan 4 specs: gate-off no-run, block mounts the §8.3 notice +
no-run, enabled runs, degraded banner+bump+no-card, ok runs the renderQuestion thunk, `safeWrite`
swallows a rejection and passes a resolve.

- [ ] **Step 5: Commit**

```bash
git add extension/src/entrypoints/content.ts extension/src/entrypoints/content.test.ts
git commit -m "feat(extension): splice resilience gate into content.ts — isEnabled()/block-notice/§2.4 banner/§8.5 safeWrite (no Plan 2/3 recreation)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: First-run trust-onboarding line (spec §7)

On install, surface the literal trust line once (spec §7) — the counter to the "AI slop" / "pirate
site" wound. We store a `seen` flag so it shows exactly once and never re-nags.

**Files:**
- Modify: `extension/src/entrypoints/background.ts`
- Create: `extension/src/entrypoints/onboarding.ts`, `extension/src/entrypoints/onboarding.test.ts`

- [ ] **Step 1: Write the failing test `extension/src/entrypoints/onboarding.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { firstRunOnboarding, ONBOARDING_KEY, TRUST_LINE } from './onboarding';

function stubChrome() {
  const mem: Record<string, unknown> = {};
  vi.stubGlobal('chrome', {
    storage: { local: {
      get: async (k: string) => (k in mem ? { [k]: mem[k] } : {}),
      set: async (o: Record<string, unknown>) => { Object.assign(mem, o); },
    } },
  });
  return mem;
}

beforeEach(() => { vi.unstubAllGlobals(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('first-run onboarding', () => {
  it('returns the trust line and sets the seen flag on first run', async () => {
    const mem = stubChrome();
    expect(await firstRunOnboarding()).toBe(TRUST_LINE);
    expect(mem[ONBOARDING_KEY]).toBe(true);
  });

  it('returns null on subsequent runs (shown exactly once)', async () => {
    const mem = stubChrome();
    mem[ONBOARDING_KEY] = true;
    expect(await firstRunOnboarding()).toBeNull();
  });

  it('the trust line states live, unaltered, never-AI, never-stored', () => {
    expect(TRUST_LINE).toMatch(/served live from collegeboard\.org/i);
    expect(TRUST_LINE).toMatch(/never rewrite/i);
    expect(TRUST_LINE).toMatch(/never run them through AI/i);
    expect(TRUST_LINE).toMatch(/never store them/i);
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `cd extension && npx vitest run src/entrypoints/onboarding.test.ts`
Expected: FAIL — `./onboarding` not found.

- [ ] **Step 3: Create `extension/src/entrypoints/onboarding.ts`**

```ts
// First-run trust onboarding (spec §7). The literal counter to the OnePrep "AI slop" / "pirate site"
// wound. Shown exactly once. The line is verbatim from the spec.
export const ONBOARDING_KEY = 'onboarding.seen';
export const TRUST_LINE =
  "These are College Board's own questions, served live from collegeboard.org. " +
  'We never rewrite them, never run them through AI, and never store them — only your answers and progress.';

export async function firstRunOnboarding(): Promise<string | null> {
  try {
    const got = await chrome.storage.local.get(ONBOARDING_KEY);
    if ((got as Record<string, unknown>)[ONBOARDING_KEY] === true) return null;
    await chrome.storage.local.set({ [ONBOARDING_KEY]: true });
    return TRUST_LINE;
  } catch {
    return null; // never block startup on a storage hiccup
  }
}
```

- [ ] **Step 4: Modify `extension/src/entrypoints/background.ts` to emit the line on install**

Replace the file body:
```ts
import { firstRunOnboarding } from './onboarding';

// Minimal service worker. On install, surface the one-time trust line (spec §7).
chrome.runtime.onInstalled.addListener(() => {
  console.log('[focused-practice] installed');
  void firstRunOnboarding().then((line) => { if (line) console.log('[focused-practice]', line); });
});
```

- [ ] **Step 5: Run it; verify it passes**

Run: `cd extension && npx vitest run src/entrypoints/onboarding.test.ts`
Expected: PASS (3 passed) — first run returns the line + sets flag, subsequent returns null, line content asserted.

- [ ] **Step 6: Commit**

```bash
git add extension/src/entrypoints/onboarding.ts extension/src/entrypoints/onboarding.test.ts extension/src/entrypoints/background.ts
git commit -m "feat(extension): first-run trust-onboarding line, shown exactly once (spec §7)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Privacy policy + Limited-Use + non-affiliation (spec §10, §12.5)

A store-required privacy policy stating we store only IDs + the student's own data, never CB content,
with the Chrome Web Store **Limited Use** statement and the **non-affiliation** notice (spec §10).
Add a sideload note (spec §11 O3).

**Files:**
- Create: `extension/PRIVACY.md`, `extension/SIDELOAD.md`
- Create: `extension/privacy.test.ts`

- [ ] **Step 1: Write the failing test `extension/privacy.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const privacy = readFileSync(join(root, 'PRIVACY.md'), 'utf8');

describe('privacy policy', () => {
  it('makes the only-IDs-and-own-data claim', () => {
    expect(privacy).toMatch(/only.*question ID/i);
    expect(privacy).toMatch(/your own data|your answers and progress/i);
    expect(privacy).toMatch(/never store.*question (content|text)/i);
  });

  it('contains the Chrome Web Store Limited Use statement', () => {
    expect(privacy).toMatch(/limited use/i);
    expect(privacy).toMatch(/do not sell|not sold|never sold/i);
    expect(privacy).toMatch(/no (server|backend|account)|local-only|stays on your device/i);
  });

  it('contains the non-affiliation notice verbatim', () => {
    expect(privacy).toMatch(/Not affiliated with, authorized, or endorsed by College Board; SAT is a trademark of the College Board/);
  });

  it('states no AI ever touches CB content', () => {
    expect(privacy).toMatch(/never.*AI/i);
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `cd extension && npx vitest run privacy.test.ts`
Expected: FAIL — `PRIVACY.md` not found.

- [ ] **Step 3: Create `extension/PRIVACY.md`**

```md
# Privacy Policy — Focused Practice

_Last updated: 2026-06-15_

## What we store

Focused Practice stores **only the question ID and your own data** — your selected answer, whether
it was correct, your optional notes, and your session/progress. We **never store the question
content or text** (the stem, passages, answer choices, or explanations). College Board's questions
are read live from the page in your browser, shown to you live, and discarded from memory — they are
never written to disk, never cached, and never sent anywhere.

We **never** run any College Board content through AI. Ever. (questions, passages, or explanations.)

## Where it is stored — Limited Use

All data stays on your device in your browser's local storage (IndexedDB). There is **no server, no
backend, and no account** in this version — your journal stays on your device. We do **not sell**
your data, do not transfer it to third parties, and do not use it for advertising. The extension's
**Limited Use** of data is solely to provide the in-browser study features you see (scoring, journal,
progress).

The only network request the extension ever makes is to our own configuration host
(`config.focusedpractice.app`) to read a single on/off flag. It carries no personal data and no
credentials. We never contact `collegeboard.org` programmatically.

## Not affiliated

Not affiliated with, authorized, or endorsed by College Board; SAT is a trademark of the College Board.

## Contact

Questions about this policy: privacy@focusedpractice.app
```

- [ ] **Step 4: Create `extension/SIDELOAD.md`**

```md
# Install / sideload (Firefox · Edge · Chrome)

We package for Chrome, Firefox, and Edge so an IP complaint on one store can't remove the extension
everywhere (spec §11, O3). Your journal is local-only, so even a delisting never destroys your data.

## Build the per-browser bundles

```bash
cd extension
npm run build            # Chrome (dist/)
npm run build:firefox    # Firefox (dist-firefox/)
npm run build:edge       # Edge (dist-edge/)
```

## Sideload

- **Chrome / Edge:** open `chrome://extensions` (or `edge://extensions`) → enable Developer mode →
  **Load unpacked** → select the matching `dist*/` folder.
- **Firefox:** open `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → select
  `dist-firefox/manifest.json`. (For a permanent install, submit the signed `.xpi` to AMO.)

The College Board host match is identical across all three builds; only the background style
(service worker vs. scripts) and the Firefox `gecko` id differ.
```

- [ ] **Step 5: Run it; verify it passes**

Run: `cd extension && npx vitest run privacy.test.ts`
Expected: PASS (4 passed) — only-IDs claim, Limited Use, non-affiliation verbatim, no-AI.

- [ ] **Step 6: Commit**

```bash
git add extension/PRIVACY.md extension/SIDELOAD.md extension/privacy.test.ts
git commit -m "docs(extension): privacy policy (Limited Use + non-affiliation) + sideload note

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: Per-browser build (chrome/firefox/edge) + packaging guard

Teach the build to emit a per-target bundle copying the right manifest variant, add the
`build:firefox`/`build:edge` scripts referenced in `SIDELOAD.md`, and add a packaging test asserting
all three manifests agree on the CB host and declare OUR config host only.

**Files:**
- Modify: `extension/scripts/build.mjs`, `extension/package.json`
- Create: `extension/tests/packaging.test.ts`

- [ ] **Step 1: Write the failing test `extension/tests/packaging.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ext = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (f: string) => JSON.parse(readFileSync(join(ext, f), 'utf8'));
const CB = '*://satsuiteeducatorquestionbank.collegeboard.org/*';
const CONFIG = 'https://config.focusedpractice.app/*';

describe('packaging — three browser manifests', () => {
  const manifests = ['manifest.json', 'manifest.firefox.json', 'manifest.edge.json'].map(load);

  it('all three share the identical CB content host', () => {
    for (const m of manifests) {
      expect(m.host_permissions).toContain(CB);
      expect(m.content_scripts[0].matches).toContain(CB);
    }
  });

  it('all three declare OUR config host and NOTHING else outside CB', () => {
    for (const m of manifests) {
      expect(m.host_permissions).toContain(CONFIG);
      for (const h of m.host_permissions) {
        const ok = h === CB || h === CONFIG;
        expect(ok, `unexpected host permission: ${h}`).toBe(true);
      }
      // no host permission may target collegeboard.org beyond the educator bank match
      for (const h of m.host_permissions) {
        if (/collegeboard\.org/i.test(h)) expect(h).toBe(CB);
      }
    }
  });

  it('Firefox uses background.scripts + a gecko id; Chrome/Edge use a service worker', () => {
    const [chrome, firefox, edge] = manifests;
    expect(chrome.background.service_worker).toBe('background.js');
    expect(edge.background.service_worker).toBe('background.js');
    expect(firefox.background.scripts).toEqual(['background.js']);
    expect(firefox.browser_specific_settings.gecko.id).toMatch(/@/);
  });
});
```

- [ ] **Step 2: Run it; verify it fails or passes per current manifests**

Run: `cd extension && npx vitest run tests/packaging.test.ts`
Expected: PASS (3 passed) — the manifests from Task 6 already satisfy these. (If it fails, the manifest
host lists drifted; fix them, not the test.)

- [ ] **Step 3: Modify `extension/scripts/build.mjs` for per-target output**

```js
import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';

const TARGETS = {
  chrome:  { out: 'dist',         manifest: 'manifest.json' },
  firefox: { out: 'dist-firefox', manifest: 'manifest.firefox.json' },
  edge:    { out: 'dist-edge',    manifest: 'manifest.edge.json' },
};

const target = process.argv[2] ?? 'chrome';
const cfg = TARGETS[target];
if (!cfg) { console.error(`Unknown target: ${target}. Use chrome|firefox|edge.`); process.exit(1); }

await mkdir(cfg.out, { recursive: true });
await build({
  entryPoints: {
    background: 'src/entrypoints/background.ts',
    content: 'src/entrypoints/content.ts',
  },
  outdir: cfg.out,
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  legalComments: 'none',
});
await copyFile(cfg.manifest, `${cfg.out}/manifest.json`);
console.log(`Built ${target} extension to ${cfg.out}/`);
```

- [ ] **Step 4: Add the per-target scripts to `extension/package.json`**

In `"scripts"`, replace the `"build"` line and add two siblings:
```json
    "build": "node scripts/build.mjs chrome",
    "build:firefox": "node scripts/build.mjs firefox",
    "build:edge": "node scripts/build.mjs edge",
```

- [ ] **Step 5: Build all three; verify outputs**

Run:
```bash
cd extension && npm run build && npm run build:firefox && npm run build:edge
```
Expected:
```
Built chrome extension to dist/
Built firefox extension to dist-firefox/
Built edge extension to dist-edge/
```
And `dist/manifest.json`, `dist-firefox/manifest.json` (background.scripts), `dist-edge/manifest.json`
all exist with `background.js` + `content.js`.

- [ ] **Step 6: Run the packaging test green**

Run: `cd extension && npx vitest run tests/packaging.test.ts`
Expected: PASS (3 passed).

- [ ] **Step 7: Commit**

```bash
git add extension/scripts/build.mjs extension/package.json extension/tests/packaging.test.ts
git commit -m "build(extension): per-browser bundles (chrome/firefox/edge) + packaging guard

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 12: Full suite green — typecheck + all tests + extended guard

Gate the whole plan: typecheck clean and every test green, including the extended legal CI guard and
the packaging guard.

**Files:** none (verification task).

- [ ] **Step 1: Typecheck**

Run: `cd extension && npm run typecheck`
Expected: clean (no errors). The new `src/resilience/*`, `src/config.ts`, `src/entrypoints/*`,
`tests/packaging.test.ts`, and `privacy.test.ts` typecheck against the Plan 1/2/3 types.

- [ ] **Step 2: Full test suite**

Run: `cd extension && npm test`
Expected: all PASS — Plan 1 (smoke, model, guard, store, scoring, stats, merge, reader, observer),
Plan 2/3 suites, and Plan 4 (config, killswitch, block-detect, contract-check, content, onboarding,
privacy, guard-ci [extended], packaging).

- [ ] **Step 3: Confirm the extended guard specifically**

Run: `cd extension && npx vitest run tests/guard-ci.test.ts tests/packaging.test.ts`
Expected: PASS — no source fetches collegeboard.org; the only fetched literal is OUR config URL; no
retry-on-CB shape; all three manifests agree on the CB host and OUR config host only.

- [ ] **Step 4: Commit (if any incidental fixups were needed)**

```bash
git add -A extension
git commit -m "chore(extension): plan-4 suite green — typecheck + extended legal guard + packaging

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" || echo "nothing to commit"
```

---

## Self-review (completed during planning)

**Spec coverage table** (each relevant spec section/decision → the task that implements it):

| Spec / contract ref | Requirement | Task |
|---|---|---|
| §8.1 / contract §2.4 | DOM-contract self-check; never guess a score; failure counter; "Couldn't read this one — answer it on CB" | Tasks 4, 5, 8 |
| §8.2 | Kill-switch — hosted config flag disables the overlay instantly | Tasks 1, 2 |
| §8.3 | 403/block detection → **disable AND point to CB** (the `renderBlockNotice` link); never retry, never call the API | Tasks 3 (classify), 5 (`renderBlockNotice`), 8 (mount on block) |
| §8.4 | Shadow DOM + TrustedHTML from day one (banner + block notice via Plan 2's `html()` / the single `TT_POLICY`) | Task 5 |
| §8.5 | Graceful degradation — **IndexedDB write failure → session works, untracked** (`safeWrite` try/catch around `recordAttempt`/`saveNote`/`saveSession`); storage hiccup never blocks startup | Task 8 (`safeWrite` on the IndexedDB writes), Tasks 2 (best-effort cache), 4 (best-effort counter), 9 (storage try/catch) |
| contract §2.5 | `isEnabled(): Promise<boolean>`; Plan 4 wraps Plan 2/3 mount | Tasks 2, 8 |
| §10 | only `{ID + own data}`; never call qbank-api/collegeboard.org; non-affiliation notice; never AI on CB content | Tasks 7 (CI guard), 10 (privacy) |
| §9 | Headline legal guard extended (no CB fetch; fetch allowlist = OUR host) | Task 7 |
| §11 O2 | C&D — pre-write counter-narrative + ship the kill-switch | Tasks 2, 10 (PRIVACY narrative) |
| §11 O3 | Chrome Web Store delisting — package Firefox + Edge, support sideload, keep data local | Tasks 6, 11, 10 (SIDELOAD) |
| §7 | First-run trust-onboarding line (verbatim) | Task 9 |
| §12 step 4 | Resilience — kill-switch, 403/block detection, DOM-contract self-check, CI guard | Tasks 2, 3, 4, 5, 7, 8 |
| §12 step 5 | Package Chrome/Firefox/Edge; privacy policy + Limited-Use + non-affiliation | Tasks 6, 10, 11 |

All six §8 error-handling points are covered: §8.1 (Tasks 4/5/8), §8.2 (Tasks 1/2), §8.3 — the
**full** "disable AND point to CB" half: Task 3 classifies the block, Task 5's `renderBlockNotice`
renders the non-verdict "use CB directly" link, and Task 8's `guardedStart` mounts it (then returns,
never retrying) on `detectBlock(...) !== null`; §8.4 (Task 5, all HTML through Plan 2's one `html()`
policy); §8.5 — the named **IndexedDB** write path: Task 8 wraps Plan 2's `recordAttempt`/`saveNote`/
`saveSession` in `safeWrite` so an IndexedDB write failure leaves the session working but untracked
(this is the store the spec names, not just the chrome.storage caches in Tasks 2/4); §8.6 (question-type
ungraded fallback is Plan 2's `score().graded===false`; Plan 4's contract-check adds the
unreadable→banner path layered on top — Task 4 `no-answerable-content`, Task 8 routing).

**Placeholder scan:** none. No TBD/TODO/"implement later"/"add error handling"/"similar to Task N".
Every task shows real test code and real implementation code; every run step shows the exact command
and expected output. Task 12 is a verification gate with explicit acceptance, not a placeholder.

**Type-consistency note (signatures match the contract):**
- `isEnabled(): Promise<boolean>` — exactly contract §2.5; consumed by `guardedStart()` in `content.ts`.
- `mountHost(doc: Document): ShadowRoot`, `HOST_ID = 'focused-practice-root'`, `TT_POLICY =
  'focused-practice'` — reused verbatim from contract §2.1; `renderBanner(root: ShadowRoot)`,
  `renderBlockNotice(root: ShadowRoot)`, and `guardedStart()` consume them with matching types. No
  redefinition. All banner/notice HTML goes through Plan 2's `html()` — the SINGLE `focused-practice`
  policy created once in `host.ts`; Plan 4 never calls `createPolicy` again (contract §2.1).
- `QuestionView` (contract §1, `src/cb/reader.ts`) is consumed read-only by `checkContract` and
  `handleQuestion` — fields match the frozen reader output exactly.
- **Plan 2's `renderCard(shadow: ShadowRoot, vm: CardVM, live: LiveContent, h: CardHandlers): void`
  is reused EXACTLY as the frozen Plan 2 surface defines it** — Plan 4 never redefines it and never
  calls it with a different arity. `content.ts`'s `showQuestion` keeps its existing 4-arg
  `renderCard(shadow, toCardVM(view, index, index + 1), live, handlers)` call; Plan 4 only passes that
  call as a zero-arg `renderQuestion: () => void` thunk into `handleQuestion(shadow, view,
  renderQuestion)`, so the §2.4 contract gate decides *whether* to invoke the (unchanged) Plan 2 call.
- No Plan 1 frozen API (`makeAttempt`/`recordAttempt`/`score`/`deriveStats`/`readQuestion`/
  `observeQuestions`) and no Plan 2/3 export (`runLoop`, `refreshBadges`, `mountPanelToggle`,
  `handleMessage`, `findResultsList`) is redefined; Task 8 imports/keeps them where Plan 2/3 already
  wire them and only appends to `content.test.ts` (one canonical `content.test.ts`, never recreated).
- New symbols introduced by Plan 4 (`CONFIG_HOST`, `CONFIG_FLAG_URL`, `CACHE_KEY`, `detectBlock`,
  `isBlockStatus`, `BLOCK_REASON`, `checkContract`, `bumpFailureCounter`, `renderBanner`, `BANNER_ID`,
  `renderBlockNotice`, `BLOCK_NOTICE_ID`, `handleQuestion`, `guardedStart`, `safeWrite`,
  `FAILURE_KEY`, `firstRunOnboarding`, `TRUST_LINE`, `ONBOARDING_KEY`) live only in
  `src/config.ts` and `src/resilience/*` / `src/entrypoints/*` — none collide with a contract §1/§2 name.
```
