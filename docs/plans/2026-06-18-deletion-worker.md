# Deletion Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tiny Cloudflare Worker at `api.focusedpractice.app/v1/delete` that takes `POST {install_id}` from the extension and erases that install's data in PostHog — fulfilling the "delete my analytics data" right without shipping the PostHog private key in the extension.

**Architecture:** A single-endpoint TypeScript Worker (wrangler). It holds the PostHog **personal** API key (`phx_`, `person:write`) as an encrypted secret, validates the posted `install_id`, rate-limits, then calls PostHog's `persons/bulk_delete` management API (`distinct_ids:[install_id]`, `delete_events:true`). PostHog deletion is **asynchronous** (it runs during off-peak/weekend windows), so the Worker returns "submitted," not "completed."

**Tech Stack:** Cloudflare Workers · TypeScript · `wrangler` (v4, `wrangler.jsonc`) · `@cloudflare/vitest-pool-workers` for tests · PostHog US management API.

**Prerequisite (already done):** the extension now sends `$process_person_profile: true`, so each `install_id` has a PostHog person profile — without this, `bulk_delete` by `distinct_id` would match nothing. The extension already POSTs `{ install_id }` to `https://api.focusedpractice.app/v1/delete` (`extension/src/telemetry/delete.ts`); this Worker is the server side of that call.

## Global Constraints

- **Lives at** `deletion-worker/` (repo root, sibling to `extension/`). Its own npm project; does not touch `extension/`.
- **Endpoint contract (must match the extension verbatim):** `POST https://api.focusedpractice.app/v1/delete`, request body `{ "install_id": "<uuid>" }`.
- **PostHog management host is `https://us.posthog.com`** — NOT the ingestion host `us.i.posthog.com`. Deletion calls go to the management host only.
- **Auth:** PostHog **personal** API key, prefix `phx_`, scope `person:write`, sent as `Authorization: Bearer <key>`. Stored ONLY as a wrangler secret `POSTHOG_PERSONAL_API_KEY`. **Never** committed; `.dev.vars*` and `.env*` are gitignored. The public `phc_` project token is NOT used here and cannot delete.
- **Deletion call:** `POST /api/projects/{POSTHOG_PROJECT_ID}/persons/bulk_delete/` with `{ "distinct_ids": ["<install_id>"], "delete_events": true }`. `POSTHOG_PROJECT_ID` = `376909` (project "Focused Practice"). Read the `202` body's `persons_found` / `events_queued_for_deletion`.
- **Deletion is async:** a `202` means "queued," not "deleted" (PostHog processes during off-peak/weekend windows). The Worker never claims completion.
- **Validate input:** `install_id` must be a UUID-shaped string (`/^[0-9a-f-]{36}$/i`), else `400` and PostHog is never called.
- **Abuse defense:** rate-limit (install_ids are random, non-enumerable UUIDs; rate-limiting is the practical guard). No shared secret (it would ship in the bundle anyway).
- **No storage, minimal logging:** the Worker keeps no state and does not log the full `install_id`.
- **TDD:** tests authored first; mock the outbound PostHog `fetch` — never hit live PostHog in tests.

---

### Task 1: Scaffold the Worker project

**Files:**
- Create: `deletion-worker/package.json`, `deletion-worker/wrangler.jsonc`, `deletion-worker/tsconfig.json`, `deletion-worker/vitest.config.ts`, `deletion-worker/src/index.ts`, `deletion-worker/test/tsconfig.json`, `deletion-worker/test/index.spec.ts`
- Modify: root `.gitignore`

**Interfaces:**
- Produces: `export default { fetch }` Worker (an `ExportedHandler<Env>`); `interface Env { POSTHOG_PERSONAL_API_KEY: string; POSTHOG_PROJECT_ID: string; POSTHOG_API_HOST?: string; RATE_LIMITER?: RateLimit }`. Later tasks fill in the handler.

- [ ] **Step 1: Create the project files.**

`deletion-worker/package.json`:
```json
{
  "name": "focusedpractice-deletion-worker",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "cf-typegen": "wrangler types"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.8.0",
    "typescript": "^5.6.0",
    "vitest": "^3.0.0",
    "wrangler": "^4.0.0"
  }
}
```

`deletion-worker/wrangler.jsonc`:
```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "focusedpractice-deletion-worker",
  "main": "src/index.ts",
  "compatibility_date": "2026-06-18",
  "observability": { "enabled": true },
  "vars": { "POSTHOG_PROJECT_ID": "376909", "POSTHOG_API_HOST": "https://us.posthog.com" }
}
```

`deletion-worker/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "esnext",
    "module": "esnext",
    "moduleResolution": "bundler",
    "lib": ["esnext"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src/**/*.ts"]
}
```

`deletion-worker/vitest.config.ts`:
```ts
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: {
            POSTHOG_PERSONAL_API_KEY: 'phx_test_key',
            POSTHOG_PROJECT_ID: '376909',
            POSTHOG_API_HOST: 'https://ph.test',
          },
        },
      },
    },
  },
});
```

`deletion-worker/test/tsconfig.json`:
```json
{
  "compilerOptions": { "types": ["@cloudflare/vitest-pool-workers"] },
  "include": ["**/*.ts", "../src/**/*.ts"]
}
```

`deletion-worker/src/index.ts` (skeleton — later tasks expand `fetch`):
```ts
export interface Env {
  POSTHOG_PERSONAL_API_KEY: string;
  POSTHOG_PROJECT_ID: string;
  POSTHOG_API_HOST?: string;
  RATE_LIMITER?: RateLimit;
}

export default {
  async fetch(_request: Request, _env: Env): Promise<Response> {
    return new Response('Not Found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
```

Append to the root `.gitignore`:
```
deletion-worker/node_modules/
deletion-worker/.dev.vars*
deletion-worker/.env*
deletion-worker/.wrangler/
```

`deletion-worker/test/index.spec.ts`:
```ts
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index';

function req(url: string, init?: RequestInit): Request { return new Request(url, init); }

describe('deletion worker', () => {
  it('returns 404 for an unknown path', async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(req('https://api.focusedpractice.app/'), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Install and run the failing/first test.**

Run: `cd deletion-worker && npm install && npx vitest run`
Expected: dependencies install; the `404 for an unknown path` test PASSES (skeleton already returns 404). If the pool fails to start, re-check `vitest.config.ts` / `wrangler.jsonc` paths.

- [ ] **Step 3: Typecheck.**

Run: `cd deletion-worker && npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit.**

```bash
git add deletion-worker .gitignore
git commit -m "feat(deletion-worker): scaffold Cloudflare Worker project (wrangler + vitest-pool-workers)"
```

---

### Task 2: Routing + CORS preflight

**Files:**
- Modify: `deletion-worker/src/index.ts`
- Test: `deletion-worker/test/index.spec.ts`

**Interfaces:**
- Consumes: `Env` (Task 1).
- Produces: only `POST /v1/delete` is routed onward; `OPTIONS` → `204` + CORS; other methods on `/v1/delete` → `405`; other paths → `404`. Helpers `corsHeaders(request)`, `withCors(request, res)`.

- [ ] **Step 1: Write the failing tests** — add to `test/index.spec.ts`:

```ts
const DELETE_URL = 'https://api.focusedpractice.app/v1/delete';
const EXT_ORIGIN = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';

it('answers the CORS preflight with 204 and allow-methods', async () => {
  const ctx = createExecutionContext();
  const res = await worker.fetch(req(DELETE_URL, { method: 'OPTIONS', headers: { Origin: EXT_ORIGIN } }), env, ctx);
  await waitOnExecutionContext(ctx);
  expect(res.status).toBe(204);
  expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  expect(res.headers.get('Access-Control-Allow-Origin')).toBe(EXT_ORIGIN);
});

it('rejects GET on the delete path with 405', async () => {
  const ctx = createExecutionContext();
  const res = await worker.fetch(req(DELETE_URL, { method: 'GET' }), env, ctx);
  await waitOnExecutionContext(ctx);
  expect(res.status).toBe(405);
});

it('returns 404 for POST to a wrong path', async () => {
  const ctx = createExecutionContext();
  const res = await worker.fetch(req('https://api.focusedpractice.app/other', { method: 'POST' }), env, ctx);
  await waitOnExecutionContext(ctx);
  expect(res.status).toBe(404);
});
```

- [ ] **Step 2: Run to verify failure.**

Run: `cd deletion-worker && npx vitest run`
Expected: the 3 new tests FAIL (skeleton returns 404 for everything; OPTIONS gets 404, GET gets 404 not 405).

- [ ] **Step 3: Implement routing + CORS** — replace `src/index.ts`:

```ts
export interface Env {
  POSTHOG_PERSONAL_API_KEY: string;
  POSTHOG_PROJECT_ID: string;
  POSTHOG_API_HOST?: string;
  RATE_LIMITER?: RateLimit;
}

const DELETE_PATH = '/v1/delete';

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') ?? '';
  // Only reflect a chrome-extension origin; never echo arbitrary web origins for a deletion endpoint.
  const allow = origin.startsWith('chrome-extension://') ? origin : 'null';
  return {
    'Access-Control-Allow-Origin': allow,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function withCors(request: Request, res: Response): Response {
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsHeaders(request))) h.set(k, v);
  return new Response(res.body, { status: res.status, headers: h });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export default {
  async fetch(request: Request, _env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
    if (pathname !== DELETE_PATH) return new Response('Not Found', { status: 404 });
    if (request.method !== 'POST') return withCors(request, new Response('Method Not Allowed', { status: 405 }));
    return withCors(request, json({ ok: true }, 200)); // placeholder; Task 3+ replace
  },
} satisfies ExportedHandler<Env>;
```

- [ ] **Step 4: Run to verify pass.**

Run: `cd deletion-worker && npx vitest run`
Expected: all tests PASS.

- [ ] **Step 5: Commit.**

```bash
git add deletion-worker/src/index.ts deletion-worker/test/index.spec.ts
git commit -m "feat(deletion-worker): route /v1/delete, CORS preflight, method guards"
```

---

### Task 3: Request validation

**Files:**
- Modify: `deletion-worker/src/index.ts`
- Test: `deletion-worker/test/index.spec.ts`

**Interfaces:**
- Produces: `isValidInstallId(v: unknown): v is string` (UUID-shape, 36 chars); the handler returns `415` for non-JSON, `400` for invalid/missing `install_id`, and never calls PostHog on invalid input.

- [ ] **Step 1: Write the failing tests** — add:

```ts
function postJson(body: unknown, ct = 'application/json'): Request {
  return req(DELETE_URL, { method: 'POST', headers: { 'Content-Type': ct, Origin: EXT_ORIGIN }, body: JSON.stringify(body) });
}

it('rejects a non-JSON content-type with 415', async () => {
  const ctx = createExecutionContext();
  const res = await worker.fetch(req(DELETE_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'x' }), env, ctx);
  await waitOnExecutionContext(ctx);
  expect(res.status).toBe(415);
});

it('rejects a missing/invalid install_id with 400', async () => {
  for (const body of [{}, { install_id: 123 }, { install_id: 'too-short' }, { install_id: 'a'.repeat(64) }]) {
    const ctx = createExecutionContext();
    const res = await worker.fetch(postJson(body), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(400);
  }
});
```

- [ ] **Step 2: Run to verify failure.**

Run: `cd deletion-worker && npx vitest run`
Expected: new tests FAIL (placeholder returns 200 for any POST).

- [ ] **Step 3: Implement validation** — in `src/index.ts`, add the guard and use it in the handler (replace the placeholder return):

```ts
const INSTALL_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidInstallId(v: unknown): v is string { return typeof v === 'string' && INSTALL_ID_RE.test(v); }
```

Replace the placeholder `return withCors(request, json({ ok: true }, 200));` with:

```ts
    if (!request.headers.get('Content-Type')?.includes('application/json'))
      return withCors(request, json({ error: 'expected application/json' }, 415));

    let body: unknown;
    try { body = await request.json(); } catch { return withCors(request, json({ error: 'invalid JSON' }, 400)); }
    const install_id = (body as { install_id?: unknown })?.install_id;
    if (!isValidInstallId(install_id))
      return withCors(request, json({ error: 'missing or invalid install_id' }, 400));

    return withCors(request, json({ ok: true }, 202)); // Task 4 replaces with the PostHog call
```

- [ ] **Step 4: Run to verify pass.**

Run: `cd deletion-worker && npx vitest run`
Expected: all tests PASS.

- [ ] **Step 5: Commit.**

```bash
git add deletion-worker/src/index.ts deletion-worker/test/index.spec.ts
git commit -m "feat(deletion-worker): validate JSON body + UUID-shaped install_id"
```

---

### Task 4: PostHog bulk_delete integration (core)

**Files:**
- Modify: `deletion-worker/src/index.ts`
- Test: `deletion-worker/test/index.spec.ts`

**Interfaces:**
- Consumes: `Env` (`POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID`, `POSTHOG_API_HOST`).
- Produces: on a valid `install_id`, the handler calls `POST {host}/api/projects/{projectId}/persons/bulk_delete/` with `Authorization: Bearer <key>` and body `{ distinct_ids: [install_id], delete_events: true }`; returns `202 { ok:true, submitted:true, matched:<persons_found>0> }` on PostHog 2xx, and `502 { ok:false }` on a PostHog error.

- [ ] **Step 1: Write the failing tests** — add (mock the outbound PostHog `fetch`):

```ts
import { vi, afterEach } from 'vitest';
afterEach(() => vi.restoreAllMocks());

const VALID_ID = '4156b4fe-3f36-4c9d-859f-ca179b497cbc';

it('forwards a valid install_id to PostHog bulk_delete with the Bearer key, returns 202', async () => {
  const phMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ persons_found: 1, events_queued_for_deletion: true }), { status: 202 }),
  );
  const ctx = createExecutionContext();
  const res = await worker.fetch(postJson({ install_id: VALID_ID }), env, ctx);
  await waitOnExecutionContext(ctx);

  expect(res.status).toBe(202);
  expect(await res.json()).toMatchObject({ ok: true, submitted: true, matched: true });
  const [url, init] = phMock.mock.calls[0]!;
  expect(String(url)).toBe('https://ph.test/api/projects/376909/persons/bulk_delete/');
  expect((init as RequestInit).method).toBe('POST');
  expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer phx_test_key' });
  expect(JSON.parse((init as RequestInit).body as string)).toEqual({ distinct_ids: [VALID_ID], delete_events: true });
});

it('reports matched:false when PostHog found no person (still ok/submitted)', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ persons_found: 0, events_queued_for_deletion: false }), { status: 202 }),
  );
  const ctx = createExecutionContext();
  const res = await worker.fetch(postJson({ install_id: VALID_ID }), env, ctx);
  await waitOnExecutionContext(ctx);
  expect(res.status).toBe(202);
  expect(await res.json()).toMatchObject({ ok: true, matched: false });
});

it('returns 502 when PostHog errors', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 403 }));
  const ctx = createExecutionContext();
  const res = await worker.fetch(postJson({ install_id: VALID_ID }), env, ctx);
  await waitOnExecutionContext(ctx);
  expect(res.status).toBe(502);
});
```

- [ ] **Step 2: Run to verify failure.**

Run: `cd deletion-worker && npx vitest run`
Expected: new tests FAIL (handler still returns the Task-3 placeholder 202 without calling PostHog).

- [ ] **Step 3: Implement the PostHog call** — replace the Task-3 placeholder return (`return withCors(request, json({ ok: true }, 202));`) with:

```ts
    const host = env.POSTHOG_API_HOST ?? 'https://us.posthog.com';
    const url = `${host}/api/projects/${env.POSTHOG_PROJECT_ID}/persons/bulk_delete/`;
    let phRes: Response;
    try {
      phRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.POSTHOG_PERSONAL_API_KEY}` },
        body: JSON.stringify({ distinct_ids: [install_id], delete_events: true }),
      });
    } catch {
      return withCors(request, json({ ok: false, error: 'upstream_unreachable' }, 502));
    }
    if (!phRes.ok) return withCors(request, json({ ok: false, error: 'upstream_failed' }, 502));
    // 202 = queued; PostHog deletes events asynchronously (off-peak/weekend windows). We never claim completion.
    const result = (await phRes.json().catch(() => ({}))) as { persons_found?: number };
    return withCors(request, json({ ok: true, submitted: true, matched: (result.persons_found ?? 0) > 0 }, 202));
```

- [ ] **Step 4: Run to verify pass.**

Run: `cd deletion-worker && npx vitest run`
Expected: all tests PASS.

- [ ] **Step 5: Commit.**

```bash
git add deletion-worker/src/index.ts deletion-worker/test/index.spec.ts
git commit -m "feat(deletion-worker): call PostHog persons/bulk_delete (async; reads persons_found)"
```

---

### Task 5: Rate limiting

**Files:**
- Modify: `deletion-worker/src/index.ts`, `deletion-worker/wrangler.jsonc`, `deletion-worker/vitest.config.ts`
- Test: `deletion-worker/test/index.spec.ts`

**Interfaces:**
- Consumes: an optional `RATE_LIMITER: RateLimit` binding.
- Produces: when the limiter denies, the handler returns `429` and does NOT call PostHog. When the binding is absent, requests pass (so unit tests without the binding still work).

- [ ] **Step 1: Write the failing test** — add:

```ts
it('returns 429 and never calls PostHog when rate-limited', async () => {
  const phMock = vi.spyOn(globalThis, 'fetch');
  const limited: Env = { ...env, RATE_LIMITER: { limit: async () => ({ success: false }) } as unknown as RateLimit };
  const ctx = createExecutionContext();
  const res = await worker.fetch(postJson({ install_id: VALID_ID }), limited, ctx);
  await waitOnExecutionContext(ctx);
  expect(res.status).toBe(429);
  expect(phMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to verify failure.**

Run: `cd deletion-worker && npx vitest run`
Expected: the new test FAILS (no rate-limit branch yet; returns 202 and calls PostHog).

- [ ] **Step 3: Implement** — in `src/index.ts`, right AFTER the `install_id` validation and BEFORE the PostHog call, add:

```ts
    if (env.RATE_LIMITER) {
      const { success } = await env.RATE_LIMITER.limit({ key: install_id });
      if (!success) return withCors(request, json({ ok: false, error: 'rate_limited' }, 429));
    }
```

Add the binding to `wrangler.jsonc` (so production has it):
```jsonc
  "unsafe": {
    "bindings": [
      { "name": "RATE_LIMITER", "type": "ratelimit", "namespace_id": "1001", "simple": { "limit": 30, "period": 60 } }
    ]
  }
```

> `period` must be exactly `10` or `60`. The limiter is per-PoP and eventually consistent — fine for abuse throttling. The unit test injects its own `RATE_LIMITER` stub, so it does not depend on the binding being live in the test pool.

- [ ] **Step 4: Run to verify pass.**

Run: `cd deletion-worker && npx vitest run`
Expected: all tests PASS (the no-binding tests still pass since the branch is skipped when `RATE_LIMITER` is absent in their `env`).

- [ ] **Step 5: Commit.**

```bash
git add deletion-worker/src/index.ts deletion-worker/wrangler.jsonc deletion-worker/vitest.config.ts deletion-worker/test/index.spec.ts
git commit -m "feat(deletion-worker): rate-limit by install_id (Workers Rate Limiting binding)"
```

---

### Task 6: Secret wiring + deploy runbook (README)

**Files:**
- Create: `deletion-worker/README.md`, `deletion-worker/.dev.vars.example`

**Interfaces:**
- Produces: documentation only — how to set the secret, deploy, and bind the route. No code change.

- [ ] **Step 1: Create `deletion-worker/.dev.vars.example`:**

```
# Local-dev secret for `wrangler dev`. Copy to .dev.vars (gitignored) and fill in.
# This is the PostHog PERSONAL API key (prefix phx_) with the person:write scope — NEVER commit it.
POSTHOG_PERSONAL_API_KEY="phx_xxx_local_dev_value"
```

- [ ] **Step 2: Create `deletion-worker/README.md`:**

```markdown
# Deletion Worker

Server side of the extension's "delete my analytics data". `POST /v1/delete` with
`{ "install_id": "<uuid>" }` → calls PostHog `persons/bulk_delete` (delete_events:true)
for that distinct_id. Deletion is asynchronous on PostHog's side.

## One-time setup
1. In PostHog (project "Focused Practice", id 376909): create a **personal API key**
   (Settings → User → Personal API keys) scoped to this project with the `person:write`
   scope (and `person:read` if you later add a status check). Copy the `phx_...` value.
2. Store it as the Worker secret (never committed):
   `npx wrangler secret put POSTHOG_PERSONAL_API_KEY`
3. Deploy: `npx wrangler deploy`
4. Bind the route to `api.focusedpractice.app/v1/*` (Cloudflare dashboard → the Worker →
   Triggers → Routes, or add a `routes` entry to `wrangler.jsonc` once the zone is on
   Cloudflare). This host is already in the extension's `host_permissions`.

## Local dev
- Copy `.dev.vars.example` → `.dev.vars`, fill in a dev `phx_` key, then `npm run dev`.

## Test / typecheck
- `npm test` (vitest-pool-workers; mocks the PostHog call — never hits live PostHog).
- `npm run typecheck`.

## Notes
- `delete_events:true` removes only events captured BEFORE the request; PostHog runs the
  ClickHouse deletion during off-peak/weekend windows, so it is not instantaneous.
- Requires the extension to send `$process_person_profile:true` (person profiles ON) so a
  person exists to delete; otherwise `persons_found` is 0 and nothing is erased.
```

- [ ] **Step 3: Verify the example file is not the real secret and is gitignored-adjacent.**

Run: `cd /Users/qikeli/projects/parent-apps/sat-prep/.claude/worktrees/parsed-marinating-boole && git status --porcelain deletion-worker/.dev.vars 2>/dev/null; echo "(.dev.vars must NOT appear above)"`
Expected: no output for `.dev.vars` (only `.dev.vars.example` is tracked).

- [ ] **Step 4: Commit.**

```bash
git add deletion-worker/README.md deletion-worker/.dev.vars.example
git commit -m "docs(deletion-worker): deploy runbook + .dev.vars example (secret never committed)"
```

---

### Task 7: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full test + typecheck.**

Run: `cd deletion-worker && npm run test && npm run typecheck`
Expected: all tests pass; typecheck clean.

- [ ] **Step 2: Wrangler dry-run (validates config + bundling without deploying).**

Run: `cd deletion-worker && npx wrangler deploy --dry-run --outdir=/tmp/dw-dryrun`
Expected: builds successfully; reports the bundled Worker. No deploy occurs.

- [ ] **Step 3: Confirm no secret leaked.**

Run: `cd /Users/qikeli/projects/parent-apps/sat-prep/.claude/worktrees/parsed-marinating-boole && grep -rn "phx_" deletion-worker --include=*.ts --include=*.jsonc --include=*.json --include=*.md | grep -v "phx_test_key\|phx_xxx\|phx_..." || echo "no real phx_ key committed (good)"`
Expected: only the test/example placeholders; no real key.

- [ ] **Step 4: Commit (if any incidental fixes).**

```bash
cd /Users/qikeli/projects/parent-apps/sat-prep/.claude/worktrees/parsed-marinating-boole
git add -A deletion-worker && git commit -m "chore(deletion-worker): verification green (test + typecheck + dry-run)" || echo "nothing to commit"
```

---

## Self-Review

**1. Spec coverage** (against the telemetry spec's deletion design + the grounding facts):
- Endpoint contract `POST /v1/delete {install_id}` matching the extension → Tasks 2-3. ✓
- PostHog management host `us.posthog.com`, `persons/bulk_delete`, `distinct_ids`+`delete_events`, Bearer `phx_` → Task 4 + Global Constraints. ✓
- Async deletion (no completion claim) → Task 4 returns `submitted`, README documents async. ✓
- Private key never shipped (wrangler secret, gitignored `.dev.vars`) → Tasks 1, 6; verified Task 7. ✓
- Input validation + abuse defense (rate-limit) → Tasks 3, 5. ✓
- Profiles-ON prerequisite (so a person exists) → Global Constraints + README note. ✓

**2. Placeholder scan:** the `phx_test_key` / `phx_xxx` / `1001` namespace are intentional test/config values, not plan placeholders. Every code step has complete code and exact commands.

**3. Type consistency:** `Env` (Task 1) is consumed unchanged by all later tasks; `isValidInstallId` (Task 3) feeds the PostHog call (Task 4) and rate-limit (Task 5); the PostHog URL/body shape in Task 4 matches the Global Constraints verbatim. The `vitest-pool-workers` config API can vary by version (medium-confidence grounding) — if `defineWorkersConfig` import fails, check the installed package's README for the current entry point and adjust `vitest.config.ts` only.
