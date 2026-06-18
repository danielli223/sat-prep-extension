# Product Telemetry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add opt-in, no-PII product + health telemetry to the extension, sent to PostHog US Cloud via plain `fetch`, with an allowlist scrubber as the legal boundary and all egress routed through the background service worker.

**Architecture:** A new self-contained `src/telemetry/` module exposes one call: `emit(name, props)`. Call sites `void emit(...)` fire-and-forget → the typed builder validates against an allowlist scrubber (fail-fast) → `chrome.runtime.sendMessage({type: TELEMETRY_EVENT})` → the background worker re-scrubs (authoritative), gates on `userOptedIn && remoteAllowed`, injects trusted super-properties, enqueues to a `chrome.storage.local` buffer, and flushes batches to PostHog. No `install_id` and no event exists before explicit opt-in.

**Tech Stack:** Manifest V3 · TypeScript · esbuild · Vitest + happy-dom · `chrome.storage.local` · `chrome.alarms` · PostHog US Cloud HTTP batch API.

**Scope of THIS plan:** the extension client — telemetry module, background wiring, content call-sites, popup consent UI, manifest, and the CI egress guard. **Out of scope (separate deliverables, sequenced after):**
1. The **deletion Worker** at `api.focusedpractice.app/v1/delete` (a Cloudflare Worker holding the PostHog private key) — different runtime; its own short plan. This plan implements only the *client* call to it (mocked at the `fetch` boundary in tests).
2. The **`PRIVACY.md` rewrite + Chrome Web Store data-disclosure form + PostHog project config (retention, IP/autocapture off)** — legal/operational, require attorney sign-off before launch.

Spec: `docs/specs/2026-06-17-telemetry-design.md` (Appendix A defines the scrubber allowlist verbatim).

## Global Constraints

Every task's requirements implicitly include these (copied from the spec):

- **Opt-in, OFF by default.** No `install_id`, no events, no telemetry network before explicit opt-in.
- **No PII / no CB content / no free text / no URLs / no stack traces** ever leave the device. The scrubber (Appendix A) is the enforcement; only allowlisted, bounded, non-free-text fields pass.
- **Allowed egress hosts only:** `config.focusedpractice.app`, `us.i.posthog.com`, `api.focusedpractice.app`. **Never `collegeboard.org`, never `qbank-api`.**
- **Public PostHog token only** (`phc_…`); the private key (`phx_…`) is never bundled or referenced in the extension.
- **Every event carries** `$process_person_profile: false` and `$ip: null`; the `timestamp` is ISO-8601 stamped at capture time, never rewritten on retry/flush.
- **`install_id`** is a random `crypto.randomUUID()` in `chrome.storage.local`, distinct from the existing journal `deviceId`; deleted on opt-out.
- **Telemetry never blocks or throws into the app.** All emits are `void emit(...)`; failures are swallowed/queued.
- **Legal invariants unchanged:** read rendered DOM only, never call CB endpoints, nominative-use trademark notice intact.

---

### Task 1: Telemetry egress constants + build-time token injection

**Decision (2026-06-17):** the `phc_` project token is **build-time injected from a gitignored `.env`**, not hardcoded. It's a public/write-only key that ships in the bundle regardless — env injection adds no secrecy, only dev/prod separation + rotation. The real token lives in `extension/.env` (gitignored); esbuild injects it via `define`; `config.ts` reads it with an empty fallback (so tests, which have no `define`, see `''`).

**PostHog project (live):** "Focused Practice", US Cloud, Project ID `376909`. The real `phc_` token goes only in `extension/.env`.

**Files:**
- Modify: `extension/src/config.ts`, `extension/scripts/build.mjs`, root `.gitignore`
- Create: `extension/.env.example`
- Test: `extension/src/config.test.ts`

**Interfaces:**
- Produces: `POSTHOG_INGEST_URL: string`, `POSTHOG_PROJECT_TOKEN: string` (build-injected, `''` when absent), `TELEMETRY_DELETE_URL: string`, `TELEMETRY_FLAG_CACHE_KEY: string`. The `flags.json` URL (`CONFIG_FLAG_URL`) is reused for the remote telemetry kill flag.

- [ ] **Step 1: Write the failing test** — append to `extension/src/config.test.ts`:

```ts
import { POSTHOG_INGEST_URL, POSTHOG_PROJECT_TOKEN, TELEMETRY_DELETE_URL } from './config';

describe('telemetry egress constants', () => {
  it('posts events to the PostHog US batch host, never CB', () => {
    expect(POSTHOG_INGEST_URL).toBe('https://us.i.posthog.com/batch/');
    expect(POSTHOG_INGEST_URL).not.toMatch(/collegeboard\.org/i);
  });
  it('never falls back to a private key; injected at build, empty under test', () => {
    // No esbuild `define` under vitest → empty string, NOT a private key.
    expect(POSTHOG_PROJECT_TOKEN.startsWith('phx_')).toBe(false);
    expect(typeof POSTHOG_PROJECT_TOKEN).toBe('string');
  });
  it('targets our own deletion endpoint host', () => {
    expect(TELEMETRY_DELETE_URL).toBe('https://api.focusedpractice.app/v1/delete');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd extension && npx vitest run src/config.test.ts`
Expected: FAIL — `POSTHOG_INGEST_URL` is not exported.

- [ ] **Step 3: Write minimal implementation** — append to `extension/src/config.ts`:

```ts
// Telemetry egress (spec 2026-06-17). Opt-in only; the scrubber is the legal boundary.
// PostHog US Cloud batch ingestion. The project token is PUBLIC/write-only by PostHog's design and
// ships in the bundle; the private key (phx_...) is NEVER bundled. The token is injected at BUILD time
// from extension/.env (gitignored) for dev/prod separation — see scripts/build.mjs. Empty under test.
export const POSTHOG_INGEST_URL = 'https://us.i.posthog.com/batch/';
declare const __POSTHOG_PROJECT_TOKEN__: string | undefined;
export const POSTHOG_PROJECT_TOKEN =
  typeof __POSTHOG_PROJECT_TOKEN__ === 'string' ? __POSTHOG_PROJECT_TOKEN__ : '';
// Our own deletion-only endpoint (a Cloudflare Worker holding the private key, separate repo).
export const TELEMETRY_DELETE_URL = 'https://api.focusedpractice.app/v1/delete';
// Remote telemetry kill flag rides on the existing flags.json (CONFIG_FLAG_URL); cache key:
export const TELEMETRY_FLAG_CACHE_KEY = 'telemetry.remoteAllowed';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd extension && npx vitest run src/config.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the build-time inject + gitignore the secret**

In `extension/scripts/build.mjs`, load `.env` and pass an esbuild `define`. Near the top, after imports:

```js
import { readFileSync, existsSync } from 'node:fs';
// Load extension/.env (KEY=VALUE lines) into process.env without a dependency.
const envPath = new URL('../.env', import.meta.url);
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
```

In the esbuild build options object, add (alongside `bundle`, `format`, etc.):

```js
  define: { __POSTHOG_PROJECT_TOKEN__: JSON.stringify(process.env.POSTHOG_PROJECT_TOKEN ?? '') },
```

Add `extension/.env` to the root `.gitignore`:

```
extension/.env
```

Create `extension/.env.example`:

```
# PostHog project "Focused Practice" (US Cloud, project 376909). Public/write-only phc_ token.
# Copy to extension/.env (gitignored) and fill in. Used at build time only (scripts/build.mjs).
POSTHOG_PROJECT_TOKEN=phc_xxx
```

> The real token (`phc_oxdMeBNN35Xnp…`) goes ONLY in `extension/.env`, never committed. For the
> spike (Task 19), create `extension/.env` with it before `npm run build`.

- [ ] **Step 6: Verify the inject path builds**

Run: `cd extension && POSTHOG_PROJECT_TOKEN=phc_test npm run build && grep -c 'phc_test' dist/background.js dist/content.js || true`
Expected: build succeeds; the token literal appears in the bundle (proving injection). `git status` shows `.env` is NOT tracked.

- [ ] **Step 7: Commit**

```bash
git add extension/src/config.ts extension/src/config.test.ts extension/scripts/build.mjs extension/.env.example .gitignore
git commit -m "feat(telemetry): egress constants + build-time token injection from gitignored .env"
```

---

### Task 2: Scrubber — the legal boundary

**Files:**
- Create: `extension/src/telemetry/scrubber.ts`
- Test: `extension/src/telemetry/scrubber.test.ts`

**Interfaces:**
- Produces: `class TelemetryGuardError extends Error`; `assertTelemetrySafe(payload: Record<string, unknown>): void` (throws on any non-allowlisted key, over-long string, nested object, or a `$ip`/`$process_person_profile` that isn't the required value).

- [ ] **Step 1: Write the failing test** — `extension/src/telemetry/scrubber.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { assertTelemetrySafe, TelemetryGuardError } from './scrubber';

describe('assertTelemetrySafe (telemetry legal boundary)', () => {
  it('accepts an allowlisted question_attempted payload', () => {
    expect(() => assertTelemetrySafe({
      event: 'question_attempted', install_id: 'u', session_id: 's', app_version: '0.0.1',
      browser: 'chrome', consent_version: '1', days_since_install_bucket: 'day_0',
      $process_person_profile: false, $ip: null,
      question_id: 'ac472881', question_type: 'mc', result: 'incorrect', reveal_used: true,
      section: 'Math', domain: 'Algebra', skill: 'Linear equations', difficulty: 'H',
    })).not.toThrow();
  });

  it('rejects any key carrying CB content or free text', () => {
    for (const key of ['question_stem', 'passage', 'choices', 'rationale', 'note_text', 'error_stack', 'page_url']) {
      expect(() => assertTelemetrySafe({ event: 'x', [key]: 'anything' })).toThrow(TelemetryGuardError);
    }
  });

  it('rejects an over-long allowlisted string (possible smuggled content)', () => {
    expect(() => assertTelemetrySafe({ event: 'x', skill: 'a'.repeat(65) })).toThrow(TelemetryGuardError);
  });

  it('rejects a nested object (only scalars may leave the device)', () => {
    expect(() => assertTelemetrySafe({ event: 'x', props: { nested: 1 } })).toThrow(TelemetryGuardError);
  });

  it('enforces the PostHog hygiene flags exactly', () => {
    expect(() => assertTelemetrySafe({ event: 'x', $ip: '1.2.3.4' })).toThrow(TelemetryGuardError);
    expect(() => assertTelemetrySafe({ event: 'x', $process_person_profile: true })).toThrow(TelemetryGuardError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd extension && npx vitest run src/telemetry/scrubber.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation** — `extension/src/telemetry/scrubber.ts`:

```ts
// TELEMETRY LEGAL BOUNDARY (spec Appendix A). Mirror of guard.ts's assertNoQuestionContent, but for
// data leaving the device to a third party. ONLY allowlisted, bounded, scalar fields may pass; a bug
// can never silently exfiltrate CB content, a student's note, a URL, a stack trace, or PII.
const ALLOWED: Record<string, number> = {
  // super-properties
  event: 64, install_id: 64, session_id: 64, app_version: 16, browser: 32, consent_version: 16,
  days_since_install_bucket: 32,
  // question_attempted
  question_id: 64, question_type: 8, result: 16, section: 64, domain: 64, skill: 64, difficulty: 8,
  // practice_started / resumed
  order_mode: 8, filter_context: 96, result_count_bucket: 16, resume_index: 0, total_in_order: 0,
  // note / calculator
  note_length: 0, calculator_type: 16,
  // session_ended
  attempted_bucket: 16, accuracy_bucket: 16, duration_bucket: 16,
  // health
  failure_reason: 32, block_reason: 32, error_code: 32, component: 32,
};
const BOOL_KEYS = new Set(['reveal_used']);

export class TelemetryGuardError extends Error {
  constructor(message: string) { super(message); this.name = 'TelemetryGuardError'; }
}

export function assertTelemetrySafe(payload: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(payload)) {
    // PostHog hygiene flags: fixed values, nothing else.
    if (key === '$process_person_profile') {
      if (value !== false) throw new TelemetryGuardError('$process_person_profile must be false');
      continue;
    }
    if (key === '$ip') {
      if (value !== null) throw new TelemetryGuardError('$ip must be null (no IP capture)');
      continue;
    }
    if (BOOL_KEYS.has(key)) {
      if (typeof value !== 'boolean') throw new TelemetryGuardError(`Field "${key}" must be boolean`);
      continue;
    }
    if (!(key in ALLOWED)) {
      throw new TelemetryGuardError(`Disallowed telemetry field "${key}"`);
    }
    if (value === null || value === undefined) continue;
    if (typeof value === 'object') {
      throw new TelemetryGuardError(`Field "${key}" must be a scalar, not an object`);
    }
    if (typeof value === 'string') {
      const limit = ALLOWED[key]!;
      if (limit > 0 && value.length > limit) {
        throw new TelemetryGuardError(`Field "${key}" exceeds ${limit} chars — possible content leak`);
      }
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd extension && npx vitest run src/telemetry/scrubber.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/src/telemetry/scrubber.ts extension/src/telemetry/scrubber.test.ts
git commit -m "feat(telemetry): allowlist scrubber (the legal egress boundary)"
```

---

### Task 3: Deterministic bucketing helpers

**Files:**
- Create: `extension/src/telemetry/buckets.ts`
- Test: `extension/src/telemetry/buckets.test.ts`

**Interfaces:**
- Produces: `countBucket(n: number): string` (used for `result_count_bucket` and `attempted_bucket`); `accuracyBucket(pct: number): string`; `durationBucket(ms: number): string`; `daysSinceInstallBucket(installedAtIso: string, nowMs: number): string`.

- [ ] **Step 1: Write the failing test** — `extension/src/telemetry/buckets.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { countBucket, accuracyBucket, durationBucket, daysSinceInstallBucket } from './buckets';

describe('bucketing (deterministic, timezone-agnostic)', () => {
  it('countBucket boundaries', () => {
    expect(countBucket(1)).toBe('1-5'); expect(countBucket(5)).toBe('1-5');
    expect(countBucket(6)).toBe('6-20'); expect(countBucket(20)).toBe('6-20');
    expect(countBucket(21)).toBe('21-50'); expect(countBucket(50)).toBe('21-50');
    expect(countBucket(51)).toBe('51+');
  });
  it('accuracyBucket boundaries (percent)', () => {
    expect(accuracyBucket(0)).toBe('0-49'); expect(accuracyBucket(49)).toBe('0-49');
    expect(accuracyBucket(50)).toBe('50-69'); expect(accuracyBucket(70)).toBe('70-84');
    expect(accuracyBucket(85)).toBe('85-100'); expect(accuracyBucket(100)).toBe('85-100');
  });
  it('durationBucket boundaries (ms)', () => {
    expect(durationBucket(60_000)).toBe('0-1m'); expect(durationBucket(60_001)).toBe('1-5m');
    expect(durationBucket(900_000)).toBe('5-15m'); expect(durationBucket(3_600_001)).toBe('60m+');
  });
  it('daysSinceInstallBucket is deterministic regardless of clock value', () => {
    const t0 = '2026-01-01T00:00:00.000Z';
    const day = 86_400_000;
    const at = (d: number) => Date.parse(t0) + d * day + 1000;
    expect(daysSinceInstallBucket(t0, at(0))).toBe('day_0');
    expect(daysSinceInstallBucket(t0, at(1))).toBe('day_1-7');
    expect(daysSinceInstallBucket(t0, at(7))).toBe('day_1-7');
    expect(daysSinceInstallBucket(t0, at(8))).toBe('day_8-30');
    expect(daysSinceInstallBucket(t0, at(31))).toBe('day_31-90');
    expect(daysSinceInstallBucket(t0, at(91))).toBe('day_90+');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd extension && npx vitest run src/telemetry/buckets.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation** — `extension/src/telemetry/buckets.ts`:

```ts
// Coarse, deterministic buckets so raw counts/durations never leave the device and analytics stay
// aggregate. Pure functions, timezone-agnostic (UTC epoch math only).
export function countBucket(n: number): string {
  if (n <= 5) return '1-5';
  if (n <= 20) return '6-20';
  if (n <= 50) return '21-50';
  return '51+';
}
export function accuracyBucket(pct: number): string {
  if (pct < 50) return '0-49';
  if (pct < 70) return '50-69';
  if (pct < 85) return '70-84';
  return '85-100';
}
export function durationBucket(ms: number): string {
  if (ms <= 60_000) return '0-1m';
  if (ms <= 300_000) return '1-5m';
  if (ms <= 900_000) return '5-15m';
  if (ms <= 3_600_000) return '15-60m';
  return '60m+';
}
export function daysSinceInstallBucket(installedAtIso: string, nowMs: number): string {
  const days = Math.floor((nowMs - Date.parse(installedAtIso)) / 86_400_000);
  if (days <= 0) return 'day_0';
  if (days <= 7) return 'day_1-7';
  if (days <= 30) return 'day_8-30';
  if (days <= 90) return 'day_31-90';
  return 'day_90+';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd extension && npx vitest run src/telemetry/buckets.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/src/telemetry/buckets.ts extension/src/telemetry/buckets.test.ts
git commit -m "feat(telemetry): deterministic bucketing helpers"
```

---

### Task 4: Event names + typed builders

**Files:**
- Create: `extension/src/telemetry/events.ts`
- Test: `extension/src/telemetry/events.test.ts`

**Interfaces:**
- Consumes: `assertTelemetrySafe` (Task 2), buckets (Task 3).
- Produces: event-name constants (`QUESTION_ATTEMPTED`, `PRACTICE_STARTED`, `NOTE_ADDED`, `CALCULATOR_OPENED`, `DOM_CONTRACT_FAILED`, `BLOCK_DETECTED`, `KILLSWITCH_ACTIVATED`, `UNSCORED_FALLBACK`, `JS_ERROR`, `PRACTICE_RESUMED`, `JOURNAL_OPENED`, `BADGE_CLICKED`, `SESSION_ENDED`, `TELEMETRY_DISABLED`); `interface TelemetryEvent { event: string; props: Record<string, unknown> }`; `buildQuestionAttempted(i): TelemetryEvent`, `buildPracticeStarted(i): TelemetryEvent`, `buildNoteAdded(i): TelemetryEvent | null`, `buildSessionEnded(i): TelemetryEvent`. Each builder runs `assertTelemetrySafe` (fail-fast) on its props before returning.

- [ ] **Step 1: Write the failing test** — `extension/src/telemetry/events.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  QUESTION_ATTEMPTED, buildQuestionAttempted, buildNoteAdded, buildPracticeStarted, buildSessionEnded,
} from './events';
import { assertTelemetrySafe } from './scrubber';

describe('event builders', () => {
  it('question_attempted carries only allowlisted, scrubber-safe props', () => {
    const e = buildQuestionAttempted({
      sessionId: 's', questionId: 'ac472881', choicesLength: 4,
      result: { graded: true, correct: false }, revealUsed: true,
      section: 'Math', domain: 'Algebra', skill: 'Linear', difficulty: 'H',
    });
    expect(e.event).toBe(QUESTION_ATTEMPTED);
    expect(e.props.question_type).toBe('mc');
    expect(e.props.result).toBe('incorrect');
    expect(e.props.reveal_used).toBe(true);
    expect(() => assertTelemetrySafe({ event: e.event, ...e.props })).not.toThrow();
  });

  it('maps grid-in and ungraded results', () => {
    expect(buildQuestionAttempted({ sessionId: 's', questionId: 'q', choicesLength: 0,
      result: { graded: false, correct: false }, revealUsed: false,
      section: 'Math', domain: 'Algebra', skill: 'x', difficulty: 'M' }).props.question_type).toBe('grid');
    expect(buildQuestionAttempted({ sessionId: 's', questionId: 'q', choicesLength: 0,
      result: { graded: false, correct: false }, revealUsed: false,
      section: 'Math', domain: 'Algebra', skill: 'x', difficulty: 'M' }).props.result).toBe('unscored');
  });

  it('note_added is null for an empty note and never carries the text', () => {
    expect(buildNoteAdded({ sessionId: 's', questionId: 'q', noteLength: 0 })).toBeNull();
    const e = buildNoteAdded({ sessionId: 's', questionId: 'q', noteLength: 42 })!;
    expect(e.props.note_length).toBe(42);
    expect(JSON.stringify(e)).not.toMatch(/text/);
  });

  it('practice_started buckets the result count', () => {
    expect(buildPracticeStarted({ sessionId: 's', orderMode: 'random', resultCount: 30,
      filterContext: 'SAT|Math|Algebra|Hard' }).props.result_count_bucket).toBe('21-50');
  });

  it('session_ended buckets attempts/accuracy/duration', () => {
    const e = buildSessionEnded({ sessionId: 's', attempted: 10, accuracyPct: 80, durationMs: 600_000 });
    expect(e.props.attempted_bucket).toBe('6-20');
    expect(e.props.accuracy_bucket).toBe('70-84');
    expect(e.props.duration_bucket).toBe('5-15m');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd extension && npx vitest run src/telemetry/events.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation** — `extension/src/telemetry/events.ts`:

```ts
import { assertTelemetrySafe } from './scrubber';
import { countBucket, accuracyBucket, durationBucket } from './buckets';
import type { ScoreResult } from '../scoring';

export const QUESTION_ATTEMPTED = 'question_attempted';
export const PRACTICE_STARTED = 'practice_started';
export const PRACTICE_RESUMED = 'practice_resumed';
export const NOTE_ADDED = 'note_added';
export const CALCULATOR_OPENED = 'calculator_opened';
export const JOURNAL_OPENED = 'journal_opened';
export const BADGE_CLICKED = 'badge_clicked';
export const SESSION_ENDED = 'session_ended';
export const DOM_CONTRACT_FAILED = 'dom_contract_failed';
export const UNSCORED_FALLBACK = 'unscored_fallback';
export const BLOCK_DETECTED = 'block_detected';
export const KILLSWITCH_ACTIVATED = 'killswitch_activated';
export const JS_ERROR = 'js_error';
export const TELEMETRY_DISABLED = 'telemetry_disabled';

export interface TelemetryEvent { event: string; props: Record<string, unknown>; }

function make(event: string, props: Record<string, unknown>): TelemetryEvent {
  assertTelemetrySafe({ event, ...props }); // fail-fast in dev/tests; background re-scrubs authoritatively
  return { event, props };
}

export function buildQuestionAttempted(i: {
  sessionId: string; questionId: string; choicesLength: number; result: ScoreResult; revealUsed: boolean;
  section: string; domain: string; skill: string; difficulty: string;
}): TelemetryEvent {
  const result = !i.result.graded ? 'unscored' : i.result.correct ? 'correct' : 'incorrect';
  return make(QUESTION_ATTEMPTED, {
    session_id: i.sessionId, question_id: i.questionId,
    question_type: i.choicesLength > 0 ? 'mc' : 'grid', result, reveal_used: i.revealUsed,
    section: i.section, domain: i.domain, skill: i.skill, difficulty: i.difficulty,
  });
}

export function buildPracticeStarted(i: {
  sessionId: string; orderMode: 'list' | 'random'; resultCount: number; filterContext: string;
}): TelemetryEvent {
  return make(PRACTICE_STARTED, {
    session_id: i.sessionId, order_mode: i.orderMode,
    result_count_bucket: countBucket(i.resultCount), filter_context: i.filterContext,
  });
}

export function buildNoteAdded(i: { sessionId: string; questionId: string; noteLength: number }): TelemetryEvent | null {
  if (i.noteLength <= 0) return null;
  return make(NOTE_ADDED, { session_id: i.sessionId, question_id: i.questionId, note_length: i.noteLength });
}

export function buildSessionEnded(i: {
  sessionId: string; attempted: number; accuracyPct: number; durationMs: number;
}): TelemetryEvent {
  return make(SESSION_ENDED, {
    session_id: i.sessionId, attempted_bucket: countBucket(i.attempted),
    accuracy_bucket: accuracyBucket(i.accuracyPct), duration_bucket: durationBucket(i.durationMs),
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd extension && npx vitest run src/telemetry/events.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/src/telemetry/events.ts extension/src/telemetry/events.test.ts
git commit -m "feat(telemetry): event-name constants + typed scrubber-safe builders"
```

---

### Task 5: Consent state + install_id lifecycle

**Files:**
- Create: `extension/src/telemetry/consent.ts`
- Test: `extension/src/telemetry/consent.test.ts`

**Interfaces:**
- Consumes: `CONFIG_FLAG_URL`, `TELEMETRY_FLAG_CACHE_KEY` (config).
- Produces: keys `INSTALL_ID_KEY='telemetry.installId'`, `INSTALLED_AT_KEY='telemetry.installedAt'`, `CONSENT_KEY='telemetry.consent'`, `CONSENT_VERSION='1'`; `getInstallId(): Promise<string|null>`; `getInstalledAt(): Promise<string|null>`; `isOptedIn(): Promise<boolean>`; `optIn(): Promise<string>` (returns new id); `clearLocalTelemetry(): Promise<void>`; `resetInstallId(): Promise<string>`; `remoteAllowed(): Promise<boolean>` (default true on failure); `isTelemetryEnabled(): Promise<boolean>` (= `isOptedIn() && remoteAllowed()`).

- [ ] **Step 1: Write the failing test** — `extension/src/telemetry/consent.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isOptedIn, optIn, clearLocalTelemetry, isTelemetryEnabled, getInstallId, INSTALL_ID_KEY,
} from './consent';

function stubChrome() {
  const mem: Record<string, unknown> = {};
  vi.stubGlobal('chrome', { storage: { local: {
    get: async (k: string) => (k in mem ? { [k]: mem[k] } : {}),
    set: async (o: Record<string, unknown>) => { Object.assign(mem, o); },
    remove: async (k: string) => { delete mem[k]; },
  } } });
  return mem;
}
beforeEach(() => vi.unstubAllGlobals());
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('consent + install_id', () => {
  it('is off and id-less before opt-in', async () => {
    stubChrome();
    expect(await isOptedIn()).toBe(false);
    expect(await getInstallId()).toBeNull();
  });

  it('opt-in mints a uuid and flips consent on', async () => {
    const mem = stubChrome();
    const id = await optIn();
    expect(id).toMatch(/[0-9a-f-]{36}/i);
    expect(mem[INSTALL_ID_KEY]).toBe(id);
    expect(await isOptedIn()).toBe(true);
  });

  it('clearLocalTelemetry deletes the id and turns consent off', async () => {
    const mem = stubChrome();
    await optIn();
    await clearLocalTelemetry();
    expect(mem[INSTALL_ID_KEY]).toBeUndefined();
    expect(await isOptedIn()).toBe(false);
  });

  it('isTelemetryEnabled is the AND of opt-in and the remote flag', async () => {
    stubChrome();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ telemetryAllowed: true }), { status: 200 })));
    expect(await isTelemetryEnabled()).toBe(false); // not opted in yet
    await optIn();
    expect(await isTelemetryEnabled()).toBe(true);  // opted in + remote allows
  });

  it('remote force-disable wins even when opted in', async () => {
    stubChrome();
    await optIn();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ telemetryAllowed: false }), { status: 200 })));
    expect(await isTelemetryEnabled()).toBe(false);
  });

  it('remote flag defaults ON when unreachable (a blip never silences a consented user)', async () => {
    stubChrome();
    await optIn();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    expect(await isTelemetryEnabled()).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd extension && npx vitest run src/telemetry/consent.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation** — `extension/src/telemetry/consent.ts`:

```ts
import { CONFIG_FLAG_URL, TELEMETRY_FLAG_CACHE_KEY } from '../config';

export const INSTALL_ID_KEY = 'telemetry.installId';
export const INSTALLED_AT_KEY = 'telemetry.installedAt';
export const CONSENT_KEY = 'telemetry.consent';
export const CONSENT_VERSION = '1';
const TIMEOUT_MS = 4000;

async function get<T>(key: string): Promise<T | undefined> {
  try { const g = await chrome.storage.local.get(key); return (g as Record<string, unknown>)[key] as T; }
  catch { return undefined; }
}

export async function getInstallId(): Promise<string | null> { return (await get<string>(INSTALL_ID_KEY)) ?? null; }
export async function getInstalledAt(): Promise<string | null> { return (await get<string>(INSTALLED_AT_KEY)) ?? null; }
export async function isOptedIn(): Promise<boolean> { return (await get<boolean>(CONSENT_KEY)) === true; }

export async function optIn(): Promise<string> {
  const id = crypto.randomUUID();
  await chrome.storage.local.set({
    [INSTALL_ID_KEY]: id, [INSTALLED_AT_KEY]: new Date().toISOString(), [CONSENT_KEY]: true,
  });
  return id;
}

// Local-only teardown shared by opt-out and delete-my-data. Caller decides what to emit first.
export async function clearLocalTelemetry(): Promise<void> {
  try { await chrome.storage.local.set({ [CONSENT_KEY]: false }); } catch { /* best-effort */ }
  try { await chrome.storage.local.remove([INSTALL_ID_KEY, INSTALLED_AT_KEY]); } catch { /* best-effort */ }
}

export async function resetInstallId(): Promise<string> {
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ [INSTALL_ID_KEY]: id, [INSTALLED_AT_KEY]: new Date().toISOString() });
  return id;
}

// Remote kill flag rides on flags.json. Mirrors killswitch: timeout + cache + DEFAULT-ON on failure.
export async function remoteAllowed(): Promise<boolean> {
  const cached = await get<boolean>(TELEMETRY_FLAG_CACHE_KEY);
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(CONFIG_FLAG_URL, { credentials: 'omit', signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return cached ?? true;
    const body = (await res.json()) as { telemetryAllowed?: unknown };
    if (typeof body.telemetryAllowed !== 'boolean') return cached ?? true;
    try { await chrome.storage.local.set({ [TELEMETRY_FLAG_CACHE_KEY]: body.telemetryAllowed }); } catch { /* */ }
    return body.telemetryAllowed;
  } catch { return cached ?? true; }
}

export async function isTelemetryEnabled(): Promise<boolean> {
  if (!(await isOptedIn())) return false;
  return remoteAllowed();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd extension && npx vitest run src/telemetry/consent.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/src/telemetry/consent.ts extension/src/telemetry/consent.test.ts
git commit -m "feat(telemetry): consent state, install_id lifecycle, remote kill flag"
```

---

### Task 6: Transport — PostHog batch body + send

**Files:**
- Create: `extension/src/telemetry/transport.ts`
- Test: `extension/src/telemetry/transport.test.ts`

**Interfaces:**
- Consumes: `POSTHOG_INGEST_URL`, `POSTHOG_PROJECT_TOKEN` (config); `TelemetryEvent` (events).
- Produces: `interface QueuedEvent { event: string; timestamp: string; properties: Record<string, unknown> }`; `buildBatch(events: QueuedEvent[]): object`; `sendBatch(events: QueuedEvent[], fetchImpl?: typeof fetch): Promise<{ ok: boolean; retryable: boolean }>`.

- [ ] **Step 1: Write the failing test** — `extension/src/telemetry/transport.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { buildBatch, sendBatch, type QueuedEvent } from './transport';
import { POSTHOG_INGEST_URL, POSTHOG_PROJECT_TOKEN } from '../config';

const ev: QueuedEvent = {
  event: 'question_attempted', timestamp: '2026-06-17T12:00:00.000Z',
  properties: { distinct_id: 'u1', $process_person_profile: false, $ip: null, question_id: 'q', result: 'correct' },
};

describe('transport', () => {
  it('builds the PostHog batch body: api_key top-level, distinct_id inside properties', () => {
    const body = buildBatch([ev]) as any;
    expect(body.api_key).toBe(POSTHOG_PROJECT_TOKEN);
    expect(body.historical_migration).toBe(false);
    expect(body.batch[0].event).toBe('question_attempted');
    expect(body.batch[0].timestamp).toBe('2026-06-17T12:00:00.000Z');
    expect(body.batch[0].properties.distinct_id).toBe('u1');
    expect(body.batch[0].properties.$process_person_profile).toBe(false);
    expect(body.batch[0].properties.$ip).toBe(null);
  });

  it('every event in the batch carries $ip:null (hygiene, checked at the wire)', () => {
    const body = buildBatch([ev, { ...ev }]) as any;
    for (const e of body.batch) expect(e.properties.$ip).toBe(null);
  });

  it('POSTs to the PostHog US batch URL and reports ok on 200', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ status: 1 }), { status: 200 }));
    const r = await sendBatch([ev], f as unknown as typeof fetch);
    expect(f.mock.calls[0]![0]).toBe(POSTHOG_INGEST_URL);
    expect(r).toEqual({ ok: true, retryable: false });
  });

  it('marks 5xx/network as retryable and 4xx as non-retryable', async () => {
    const five = vi.fn(async () => new Response('', { status: 503 }));
    expect(await sendBatch([ev], five as unknown as typeof fetch)).toEqual({ ok: false, retryable: true });
    const four = vi.fn(async () => new Response('', { status: 400 }));
    expect(await sendBatch([ev], four as unknown as typeof fetch)).toEqual({ ok: false, retryable: false });
    const down = vi.fn(async () => { throw new TypeError('offline'); });
    expect(await sendBatch([ev], down as unknown as typeof fetch)).toEqual({ ok: false, retryable: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd extension && npx vitest run src/telemetry/transport.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation** — `extension/src/telemetry/transport.ts`:

```ts
import { POSTHOG_INGEST_URL, POSTHOG_PROJECT_TOKEN } from '../config';

export interface QueuedEvent { event: string; timestamp: string; properties: Record<string, unknown>; }

// PostHog US /batch/ body: api_key top-level ONCE; per-event distinct_id lives INSIDE properties.
export function buildBatch(events: QueuedEvent[]): object {
  return {
    api_key: POSTHOG_PROJECT_TOKEN,
    historical_migration: false,
    batch: events.map((e) => ({ event: e.event, timestamp: e.timestamp, properties: e.properties })),
  };
}

export async function sendBatch(
  events: QueuedEvent[], fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; retryable: boolean }> {
  try {
    const res = await fetchImpl(POSTHOG_INGEST_URL, {
      method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildBatch(events)),
    });
    if (res.ok) return { ok: true, retryable: false };
    return { ok: false, retryable: res.status >= 500 }; // 4xx = bad payload, don't retry; 5xx = retry
  } catch {
    return { ok: false, retryable: true }; // network failure → retry later
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd extension && npx vitest run src/telemetry/transport.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/src/telemetry/transport.ts extension/src/telemetry/transport.test.ts
git commit -m "feat(telemetry): PostHog batch body builder + send (retryable classification)"
```

---

### Task 7: Queue — persistent buffer + flush

**Files:**
- Create: `extension/src/telemetry/queue.ts`
- Test: `extension/src/telemetry/queue.test.ts`

**Interfaces:**
- Consumes: `sendBatch`, `QueuedEvent` (transport).
- Produces: `QUEUE_KEY='telemetry.queue'`; `enqueue(e: QueuedEvent): Promise<void>`; `readQueue(): Promise<QueuedEvent[]>`; `purgeQueue(): Promise<void>`; `flush(fetchImpl?: typeof fetch): Promise<void>`.

- [ ] **Step 1: Write the failing test** — `extension/src/telemetry/queue.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { enqueue, readQueue, purgeQueue, flush, QUEUE_KEY } from './queue';
import type { QueuedEvent } from './transport';

function stubChrome() {
  const mem: Record<string, unknown> = {};
  vi.stubGlobal('chrome', { storage: { local: {
    get: async (k: string) => (k in mem ? { [k]: mem[k] } : {}),
    set: async (o: Record<string, unknown>) => { Object.assign(mem, o); },
    remove: async (k: string) => { delete mem[k]; },
  } } });
  return mem;
}
const ev = (id: string): QueuedEvent => ({ event: 'e', timestamp: '2026-06-17T00:00:00.000Z',
  properties: { distinct_id: id, $process_person_profile: false, $ip: null } });
beforeEach(() => vi.unstubAllGlobals());
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('queue', () => {
  it('persists across a simulated SW restart (state lives in storage, not memory)', async () => {
    const mem = stubChrome();
    await enqueue(ev('a'));
    expect((mem[QUEUE_KEY] as QueuedEvent[]).length).toBe(1); // survives because it's in storage
    expect((await readQueue()).length).toBe(1);
  });

  it('flush clears the queue on a successful send', async () => {
    stubChrome();
    await enqueue(ev('a'));
    await flush(vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch);
    expect(await readQueue()).toEqual([]);
  });

  it('flush keeps the queue on a retryable failure, drops it on 4xx', async () => {
    stubChrome();
    await enqueue(ev('a'));
    await flush(vi.fn(async () => new Response('', { status: 503 })) as unknown as typeof fetch);
    expect((await readQueue()).length).toBe(1); // retryable: kept
    await flush(vi.fn(async () => new Response('', { status: 400 })) as unknown as typeof fetch);
    expect(await readQueue()).toEqual([]);       // 4xx: dropped
  });

  it('does nothing on an empty queue (no network)', async () => {
    stubChrome();
    const f = vi.fn();
    await flush(f as unknown as typeof fetch);
    expect(f).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd extension && npx vitest run src/telemetry/queue.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation** — `extension/src/telemetry/queue.ts`:

```ts
import { sendBatch, type QueuedEvent } from './transport';

export const QUEUE_KEY = 'telemetry.queue';
const MAX_QUEUE = 500; // backstop so an offline device can't grow storage unbounded

export async function readQueue(): Promise<QueuedEvent[]> {
  try {
    const g = await chrome.storage.local.get(QUEUE_KEY);
    const q = (g as Record<string, unknown>)[QUEUE_KEY];
    return Array.isArray(q) ? (q as QueuedEvent[]) : [];
  } catch { return []; }
}

async function writeQueue(q: QueuedEvent[]): Promise<void> {
  try { await chrome.storage.local.set({ [QUEUE_KEY]: q.slice(-MAX_QUEUE) }); } catch { /* best-effort */ }
}

export async function purgeQueue(): Promise<void> {
  try { await chrome.storage.local.remove(QUEUE_KEY); } catch { /* best-effort */ }
}

export async function enqueue(e: QueuedEvent): Promise<void> {
  const q = await readQueue();
  q.push(e);
  await writeQueue(q);
}

export async function flush(fetchImpl: typeof fetch = fetch): Promise<void> {
  const q = await readQueue();
  if (q.length === 0) return;
  const { ok, retryable } = await sendBatch(q, fetchImpl);
  if (ok || !retryable) await purgeQueue(); // sent, or unrecoverable (4xx) → drop; else keep for retry
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd extension && npx vitest run src/telemetry/queue.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/src/telemetry/queue.ts extension/src/telemetry/queue.test.ts
git commit -m "feat(telemetry): persistent storage-backed queue + flush"
```

---

### Task 8: Message types

**Files:**
- Modify: `extension/src/messages.ts`
- Test: `extension/src/messages.test.ts` (create)

**Interfaces:**
- Produces: `TELEMETRY_EVENT = 'telemetry-event'`, `TELEMETRY_DELETE = 'telemetry-delete'`.

- [ ] **Step 1: Write the failing test** — `extension/src/messages.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { OPEN_JOURNAL, TELEMETRY_EVENT, TELEMETRY_DELETE } from './messages';

describe('message-type constants are distinct', () => {
  it('exposes telemetry message types', () => {
    expect(TELEMETRY_EVENT).toBe('telemetry-event');
    expect(TELEMETRY_DELETE).toBe('telemetry-delete');
  });
  it('no two message types collide', () => {
    const all = [OPEN_JOURNAL, TELEMETRY_EVENT, TELEMETRY_DELETE];
    expect(new Set(all).size).toBe(all.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd extension && npx vitest run src/messages.test.ts`
Expected: FAIL — `TELEMETRY_EVENT` not exported.

- [ ] **Step 3: Write minimal implementation** — append to `extension/src/messages.ts`:

```ts
// Telemetry hand-off. Content/popup post these; the background worker is the sole consumer + egress
// point. TELEMETRY_EVENT carries one built event; TELEMETRY_DELETE triggers server-side erasure.
export const TELEMETRY_EVENT = 'telemetry-event';
export const TELEMETRY_DELETE = 'telemetry-delete';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd extension && npx vitest run src/messages.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/src/messages.ts extension/src/messages.test.ts
git commit -m "feat(telemetry): TELEMETRY_EVENT + TELEMETRY_DELETE message types"
```

---

### Task 9: `emit()` client facade

**Files:**
- Create: `extension/src/telemetry/emit.ts`
- Test: `extension/src/telemetry/emit.test.ts`

**Interfaces:**
- Consumes: `TELEMETRY_EVENT` (messages); `TelemetryEvent` (events).
- Produces: `emit(built: TelemetryEvent | null): void` — fire-and-forget; sends `{type: TELEMETRY_EVENT, event: built}` via `chrome.runtime.sendMessage`; no-ops on `null`; never throws.

- [ ] **Step 1: Write the failing test** — `extension/src/telemetry/emit.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { emit } from './emit';
import { TELEMETRY_EVENT } from '../messages';

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('emit (fire-and-forget client facade)', () => {
  it('posts a TELEMETRY_EVENT message with the built event', () => {
    const send = vi.fn();
    vi.stubGlobal('chrome', { runtime: { id: 'x', sendMessage: send } });
    emit({ event: 'question_attempted', props: { question_id: 'q' } });
    expect(send).toHaveBeenCalledWith({ type: TELEMETRY_EVENT, event: { event: 'question_attempted', props: { question_id: 'q' } } });
  });

  it('no-ops on a null build (e.g. empty note) and never throws if sendMessage explodes', () => {
    const send = vi.fn(() => { throw new Error('no receiver'); });
    vi.stubGlobal('chrome', { runtime: { id: 'x', sendMessage: send } });
    expect(() => emit(null)).not.toThrow();
    expect(() => emit({ event: 'e', props: {} })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd extension && npx vitest run src/telemetry/emit.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation** — `extension/src/telemetry/emit.ts`:

```ts
import { TELEMETRY_EVENT } from '../messages';
import type { TelemetryEvent } from './events';

// Fire-and-forget. Callers use `void emit(builder(...))`. NEVER awaited, NEVER throws — telemetry must
// not block or break scoring/notes/the observer loop. Consent + scrubbing happen authoritatively in the
// background; this just hands the built event off. A null build (e.g. an empty note) is a no-op.
export function emit(built: TelemetryEvent | null): void {
  if (!built) return;
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
      chrome.runtime.sendMessage({ type: TELEMETRY_EVENT, event: built });
    }
  } catch { /* no receiver / context gone — telemetry is best-effort */ }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd extension && npx vitest run src/telemetry/emit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/src/telemetry/emit.ts extension/src/telemetry/emit.test.ts
git commit -m "feat(telemetry): emit() fire-and-forget client facade"
```

---

### Task 10: Background ingest — authoritative scrub, gate, super-props, enqueue

**Files:**
- Create: `extension/src/telemetry/ingest.ts`
- Test: `extension/src/telemetry/ingest.test.ts`

**Interfaces:**
- Consumes: `assertTelemetrySafe` (scrubber); `isTelemetryEnabled`, `getInstallId`, `getInstalledAt`, `CONSENT_VERSION` (consent); `daysSinceInstallBucket` (buckets); `enqueue` (queue); `TelemetryEvent` (events).
- Produces: `detectBrowser(ua: string): 'chrome'|'firefox'|'edge'`; `ingestTelemetryEvent(built: TelemetryEvent, ctx: { appVersion: string; ua: string; nowMs: number }): Promise<void>` — re-scrubs the untrusted props, AND-gates, injects trusted super-props, enqueues.

- [ ] **Step 1: Write the failing test** — `extension/src/telemetry/ingest.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { detectBrowser, ingestTelemetryEvent } from './ingest';
import { readQueue } from './queue';
import { optIn } from './consent';

function stubChrome() {
  const mem: Record<string, unknown> = {};
  vi.stubGlobal('chrome', { storage: { local: {
    get: async (k: string) => (k in mem ? { [k]: mem[k] } : {}),
    set: async (o: Record<string, unknown>) => { Object.assign(mem, o); },
    remove: async (k: string) => { delete mem[k]; },
  } } });
  return mem;
}
const ctx = { appVersion: '0.0.1', ua: 'Mozilla Chrome/120', nowMs: Date.parse('2026-06-17T00:00:00Z') };
beforeEach(() => vi.unstubAllGlobals());
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('background ingest', () => {
  it('detects the browser from the UA', () => {
    expect(detectBrowser('... Edg/120')).toBe('edge');
    expect(detectBrowser('... Firefox/121')).toBe('firefox');
    expect(detectBrowser('... Chrome/120')).toBe('chrome');
  });

  it('drops events entirely when not opted in (no queueing, no network)', async () => {
    stubChrome();
    await ingestTelemetryEvent({ event: 'question_attempted', props: { question_id: 'q' } }, ctx);
    expect(await readQueue()).toEqual([]);
  });

  it('when opted in, injects super-props ($ip:null, install_id, browser, days bucket) and enqueues', async () => {
    stubChrome();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ telemetryAllowed: true }), { status: 200 })));
    const id = await optIn();
    await ingestTelemetryEvent({ event: 'question_attempted', props: { question_id: 'q', result: 'correct' } }, ctx);
    const q = await readQueue();
    expect(q.length).toBe(1);
    expect(q[0]!.properties.distinct_id).toBe(id);
    expect(q[0]!.properties.$ip).toBe(null);
    expect(q[0]!.properties.$process_person_profile).toBe(false);
    expect(q[0]!.properties.browser).toBe('chrome');
    expect(q[0]!.properties.days_since_install_bucket).toBe('day_0');
    expect(typeof q[0]!.timestamp).toBe('string');
  });

  it('re-scrubs authoritatively: a disallowed key from a tampered message is rejected, not queued', async () => {
    stubChrome();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ telemetryAllowed: true }), { status: 200 })));
    await optIn();
    await ingestTelemetryEvent({ event: 'question_attempted', props: { note_text: 'leak!' } }, ctx);
    expect(await readQueue()).toEqual([]); // scrubber threw → swallowed → nothing queued
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd extension && npx vitest run src/telemetry/ingest.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation** — `extension/src/telemetry/ingest.ts`:

```ts
import { assertTelemetrySafe } from './scrubber';
import { isTelemetryEnabled, getInstallId, getInstalledAt, CONSENT_VERSION } from './consent';
import { daysSinceInstallBucket } from './buckets';
import { enqueue } from './queue';
import type { TelemetryEvent } from './events';

export function detectBrowser(ua: string): 'chrome' | 'firefox' | 'edge' {
  if (/Edg\//.test(ua)) return 'edge';
  if (/Firefox\//.test(ua)) return 'firefox';
  return 'chrome';
}

// The AUTHORITATIVE boundary. Runs in the background worker. Re-scrubs the UNTRUSTED message props,
// gates on consent AND the remote flag, then injects only TRUSTED, self-generated super-properties.
// Never throws (best-effort): a scrub failure or a not-opted-in state silently drops the event.
export async function ingestTelemetryEvent(
  built: TelemetryEvent, ctx: { appVersion: string; ua: string; nowMs: number },
): Promise<void> {
  try {
    if (!built || typeof built.event !== 'string') return;
    assertTelemetrySafe({ event: built.event, ...built.props }); // authoritative re-scrub of untrusted input
    if (!(await isTelemetryEnabled())) return;                    // consent && remote-allowed
    const installId = await getInstallId();
    if (!installId) return;
    const installedAt = (await getInstalledAt()) ?? new Date(ctx.nowMs).toISOString();
    const properties = {
      ...built.props,
      distinct_id: installId,
      $process_person_profile: false,
      $ip: null,
      app_version: ctx.appVersion,
      browser: detectBrowser(ctx.ua),
      consent_version: CONSENT_VERSION,
      days_since_install_bucket: daysSinceInstallBucket(installedAt, ctx.nowMs),
    };
    await enqueue({ event: built.event, timestamp: new Date(ctx.nowMs).toISOString(), properties });
  } catch { /* telemetry is best-effort; never propagate */ }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd extension && npx vitest run src/telemetry/ingest.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/src/telemetry/ingest.ts extension/src/telemetry/ingest.test.ts
git commit -m "feat(telemetry): background ingest (authoritative scrub + gate + super-props)"
```

---

### Task 11: Delete-my-data flow

**Files:**
- Create: `extension/src/telemetry/delete.ts`
- Test: `extension/src/telemetry/delete.test.ts`

**Interfaces:**
- Consumes: `getInstallId`, `clearLocalTelemetry` (consent); `purgeQueue` (queue); `TELEMETRY_DELETE_URL` (config).
- Produces: `deleteMyData(fetchImpl?: typeof fetch): Promise<void>` — POSTs the *current* `install_id` to the deletion endpoint, then clears local telemetry + purges the queue. Does NOT emit `telemetry_disabled` (that event would itself be deleted). Never throws.

- [ ] **Step 1: Write the failing test** — `extension/src/telemetry/delete.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { deleteMyData } from './delete';
import { optIn, getInstallId } from './consent';
import { enqueue, readQueue } from './queue';
import { TELEMETRY_DELETE_URL } from '../config';

function stubChrome() {
  const mem: Record<string, unknown> = {};
  vi.stubGlobal('chrome', { storage: { local: {
    get: async (k: string) => (k in mem ? { [k]: mem[k] } : {}),
    set: async (o: Record<string, unknown>) => { Object.assign(mem, o); },
    remove: async (k: string | string[]) => { for (const x of [k].flat()) delete mem[x as string]; },
  } } });
  return mem;
}
beforeEach(() => vi.unstubAllGlobals());
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('deleteMyData', () => {
  it('POSTs the current install_id to the deletion endpoint, then clears local state', async () => {
    stubChrome();
    const id = await optIn();
    await enqueue({ event: 'e', timestamp: 't', properties: { distinct_id: id } });
    const f = vi.fn(async () => new Response('{}', { status: 200 }));
    await deleteMyData(f as unknown as typeof fetch);
    expect(f.mock.calls[0]![0]).toBe(TELEMETRY_DELETE_URL);
    expect(JSON.parse((f.mock.calls[0]![1] as RequestInit).body as string)).toEqual({ install_id: id });
    expect(await getInstallId()).toBeNull();
    expect(await readQueue()).toEqual([]);
  });

  it('no id → no network, no throw', async () => {
    stubChrome();
    const f = vi.fn();
    await expect(deleteMyData(f as unknown as typeof fetch)).resolves.toBeUndefined();
    expect(f).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd extension && npx vitest run src/telemetry/delete.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation** — `extension/src/telemetry/delete.ts`:

```ts
import { getInstallId, clearLocalTelemetry } from './consent';
import { purgeQueue } from './queue';
import { TELEMETRY_DELETE_URL } from '../config';

// "Delete my data": erase server-side events for this install, then wipe local state. Order: capture
// the id → POST it → clear local. We deliberately do NOT emit telemetry_disabled here (it would be
// deleted anyway). Best-effort: a failed POST still clears local; the user can retry. Never throws.
export async function deleteMyData(fetchImpl: typeof fetch = fetch): Promise<void> {
  const id = await getInstallId();
  if (!id) return;
  try {
    await fetchImpl(TELEMETRY_DELETE_URL, {
      method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ install_id: id }),
    });
  } catch { /* best-effort; local wipe still proceeds, user can re-trigger */ }
  await clearLocalTelemetry();
  await purgeQueue();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd extension && npx vitest run src/telemetry/delete.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/src/telemetry/delete.ts extension/src/telemetry/delete.test.ts
git commit -m "feat(telemetry): delete-my-data (server erase + local wipe)"
```

---

### Task 12: Opt-out emits telemetry_disabled (lifecycle)

**Files:**
- Create: `extension/src/telemetry/lifecycle.ts`
- Test: `extension/src/telemetry/lifecycle.test.ts`

**Interfaces:**
- Consumes: `getInstallId`, `clearLocalTelemetry` (consent); `enqueue`, `flush`, `purgeQueue` (queue); `TELEMETRY_DISABLED` (events).
- Produces: `optOut(fetchImpl?: typeof fetch): Promise<void>` — emits one final `telemetry_disabled` with the *current* id, flushes, then clears local + purges. Strict order.

- [ ] **Step 1: Write the failing test** — `extension/src/telemetry/lifecycle.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { optOut } from './lifecycle';
import { optIn, getInstallId, isOptedIn } from './consent';

function stubChrome() {
  const mem: Record<string, unknown> = {};
  vi.stubGlobal('chrome', { storage: { local: {
    get: async (k: string) => (k in mem ? { [k]: mem[k] } : {}),
    set: async (o: Record<string, unknown>) => { Object.assign(mem, o); },
    remove: async (k: string | string[]) => { for (const x of [k].flat()) delete mem[x as string]; },
  } } });
  return mem;
}
beforeEach(() => vi.unstubAllGlobals());
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('optOut', () => {
  it('sends a final telemetry_disabled with the original id, then deletes id + consent', async () => {
    stubChrome();
    const id = await optIn();
    const bodies: any[] = [];
    const f = vi.fn(async (_u: string, init: RequestInit) => { bodies.push(JSON.parse(init.body as string)); return new Response('{}', { status: 200 }); });
    await optOut(f as unknown as typeof fetch);
    const sent = bodies.flatMap((b) => b.batch);
    expect(sent.some((e: any) => e.event === 'telemetry_disabled' && e.properties.distinct_id === id)).toBe(true);
    expect(await getInstallId()).toBeNull();
    expect(await isOptedIn()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd extension && npx vitest run src/telemetry/lifecycle.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation** — `extension/src/telemetry/lifecycle.ts`:

```ts
import { getInstallId, clearLocalTelemetry } from './consent';
import { enqueue, flush, purgeQueue } from './queue';
import { TELEMETRY_DISABLED } from './events';

// Opt-out: emit ONE final telemetry_disabled carrying the CURRENT id (so opt-out rate is measurable),
// flush it, THEN delete the id and purge. Order matters — the event must capture the id before deletion,
// and the queue must not outlive consent. Best-effort throughout.
export async function optOut(fetchImpl: typeof fetch = fetch): Promise<void> {
  const id = await getInstallId();
  if (id) {
    await enqueue({
      event: TELEMETRY_DISABLED, timestamp: new Date().toISOString(),
      properties: { distinct_id: id, $process_person_profile: false, $ip: null },
    });
    await flush(fetchImpl);
  }
  await clearLocalTelemetry();
  await purgeQueue();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd extension && npx vitest run src/telemetry/lifecycle.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/src/telemetry/lifecycle.ts extension/src/telemetry/lifecycle.test.ts
git commit -m "feat(telemetry): opt-out emits final telemetry_disabled then wipes"
```

---

### Task 13: Background worker wiring

**Files:**
- Modify: `extension/src/entrypoints/background.ts`
- Test: `extension/src/entrypoints/background.test.ts` (create)

**Interfaces:**
- Consumes: `ingestTelemetryEvent` (ingest); `deleteMyData` (delete); `flush` (queue); `TELEMETRY_EVENT`, `TELEMETRY_DELETE` (messages).
- Produces: `installTelemetryListeners(api): void` — registers the `onMessage` router and a `chrome.alarms` flush; testable by passing a fake `api`.

- [ ] **Step 1: Write the failing test** — `extension/src/entrypoints/background.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { installTelemetryListeners } from './background';

describe('installTelemetryListeners', () => {
  it('routes TELEMETRY_EVENT to ingest and TELEMETRY_DELETE to delete; creates a flush alarm', () => {
    const onMessage = vi.fn();
    const onAlarm = vi.fn();
    const create = vi.fn();
    const api = {
      runtime: { onMessage: { addListener: onMessage }, getManifest: () => ({ version: '0.0.1' }) },
      alarms: { create, onAlarm: { addListener: onAlarm } },
    };
    installTelemetryListeners(api as any);
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith('telemetry-flush', expect.objectContaining({ periodInMinutes: expect.any(Number) }));
    expect(onAlarm).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd extension && npx vitest run src/entrypoints/background.test.ts`
Expected: FAIL — `installTelemetryListeners` not exported.

- [ ] **Step 3: Write minimal implementation** — replace `extension/src/entrypoints/background.ts`:

```ts
import { firstRunOnboarding } from './onboarding';
import { TELEMETRY_EVENT, TELEMETRY_DELETE } from '../messages';
import { ingestTelemetryEvent } from '../telemetry/ingest';
import { deleteMyData } from '../telemetry/delete';
import { flush } from '../telemetry/queue';
import type { TelemetryEvent } from '../telemetry/events';

const FLUSH_ALARM = 'telemetry-flush';

// Telemetry egress lives ONLY here (the single auditable network exit). Injected `api` so it's testable.
export function installTelemetryListeners(api: typeof chrome): void {
  api.runtime.onMessage.addListener((msg: { type?: string; event?: TelemetryEvent }) => {
    if (msg?.type === TELEMETRY_EVENT && msg.event) {
      void ingestTelemetryEvent(msg.event, {
        appVersion: api.runtime.getManifest().version,
        ua: typeof navigator !== 'undefined' ? navigator.userAgent : 'chrome',
        nowMs: Date.now(),
      }).then(() => flush());
    } else if (msg?.type === TELEMETRY_DELETE) {
      void deleteMyData();
    }
  });
  api.alarms.create(FLUSH_ALARM, { periodInMinutes: 1 });
  api.alarms.onAlarm.addListener((a: chrome.alarms.Alarm) => { if (a.name === FLUSH_ALARM) void flush(); });
}

// Minimal service worker. On install, surface the one-time trust line (spec §7).
chrome.runtime.onInstalled.addListener(() => {
  console.log('[focused-practice] installed');
  void firstRunOnboarding().then((line) => { if (line) console.log('[focused-practice]', line); });
});

if (typeof chrome !== 'undefined' && chrome.runtime?.id && chrome.alarms) {
  installTelemetryListeners(chrome);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd extension && npx vitest run src/entrypoints/background.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/src/entrypoints/background.ts extension/src/entrypoints/background.test.ts
git commit -m "feat(telemetry): background worker routes events/delete + alarm flush"
```

---

### Task 14: Wire `emit()` into the content-script call sites

**Files:**
- Modify: `extension/src/entrypoints/content.ts`
- Test: `extension/src/entrypoints/content.test.ts` (add cases)

**Interfaces:**
- Consumes: `emit` (emit); the builders (events).
- Produces: telemetry emitted at `practice_started` (after `saveSession`), `question_attempted` (after `recordAttempt`), `note_added` (on non-empty note), `calculator_opened` (geogebra + desmos). A module-level `currentSessionId` minted at session start and read fresh per event; a per-question `revealed` flag for `reveal_used`.

- [ ] **Step 1: Write the failing test** — add to `extension/src/entrypoints/content.test.ts` (follow the file's existing harness for stubbing `chrome` + a fixture question; this asserts the emit hand-off):

```ts
// Telemetry hand-off: a TELEMETRY_EVENT is posted when a question is checked.
it('emits question_attempted after a graded Check', async () => {
  const sent: any[] = [];
  // reuse this file's existing chrome stub; ensure runtime.sendMessage records messages:
  (globalThis as any).chrome.runtime.sendMessage = (m: any) => { sent.push(m); };
  await driveOneGradedCheck(); // helper already used by neighbouring tests to run a Check to verdict
  const ev = sent.find((m) => m?.type === 'telemetry-event' && m.event?.event === 'question_attempted');
  expect(ev).toBeTruthy();
  expect(ev.event.props.result).toBeDefined();
  expect(JSON.stringify(ev)).not.toMatch(/stem|passage|rationale/i); // no content leaks
});
```

> If `content.test.ts` has no reusable `driveOneGradedCheck`/Check helper, add the smallest one mirroring the existing onCheck-driving test in that file; do not duplicate unrelated setup.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd extension && npx vitest run src/entrypoints/content.test.ts`
Expected: FAIL — no `telemetry-event` message is posted.

- [ ] **Step 3: Write minimal implementation** — edit `extension/src/entrypoints/content.ts`:

3a. Add imports near the other imports (after line 24):

```ts
import { emit } from '../telemetry/emit';
import {
  buildPracticeStarted, buildQuestionAttempted, buildNoteAdded, CALCULATOR_OPENED,
} from '../telemetry/events';
```

3b. In `start()`, after `session = makeSession({...})` and the `void safeWrite(saveSession(...))` (around line 215), add:

```ts
        emit(buildPracticeStarted({
          sessionId: session.sessionId, orderMode, resultCount: total,
          filterContext: session.filterContext,
        }));
```

3c. In `showQuestion`, add a per-question reveal flag. Change `onReveal` (line 243) to record it:

```ts
      onReveal: () => { revealed = true; revealRationale(answerContent); },
```

and declare `let revealed = false;` at the top of `showQuestion` (next to nothing else needed) and reset it there. Also change `onNote` (line 244) to emit:

```ts
      onNote: (text) => {
        if (text) {
          void safeWrite(saveNote(db, makeNote({ deviceId: dev, questionId: view.id, text })));
          emit(buildNoteAdded({ sessionId: session?.sessionId ?? '', questionId: view.id, noteLength: text.length }));
        }
      },
```

and change the calculator handlers (lines 248–249) to emit:

```ts
      onToggleCalc: () => { toggleGeoGebra(shadow); emit({ event: CALCULATOR_OPENED, props: { session_id: session?.sessionId ?? '', calculator_type: 'geogebra' } }); },
      onOpenDesmos: () => { openDesmos(); emit({ event: CALCULATOR_OPENED, props: { session_id: session?.sessionId ?? '', calculator_type: 'desmos' } }); },
```

3d. In `onCheck`, after the `await safeWrite(recordAttempt(...))` block completes (after line 306, before `renderVerdict`), emit:

```ts
    emit(buildQuestionAttempted({
      sessionId: session?.sessionId ?? '', questionId: view.id, choicesLength: view.choices.length,
      result, revealUsed: revealedFor(view.id), section: view.section, domain: view.domain,
      skill: view.skill, difficulty: view.difficulty,
    }));
```

> Track `revealed` per-question: declare `let revealed = false;` inside `showQuestion` and reset on each show; expose it to `onCheck` via a closure variable `revealedAtCheck` captured in the handlers object, or store `revealed` on a `Map<string, boolean>` keyed by `view.id`. Use the smallest approach consistent with the file (a `revealedIds = new Set<string>()` at `runLoop` scope, `add(view.id)` in `onReveal`, and `revealedFor = (id) => revealedIds.has(id)` is simplest and survives re-mounts).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd extension && npx vitest run src/entrypoints/content.test.ts && npx vitest run`
Expected: the new test PASSES and the full suite stays green.

- [ ] **Step 5: Commit**

```bash
git add extension/src/entrypoints/content.ts extension/src/entrypoints/content.test.ts
git commit -m "feat(telemetry): emit practice_started, question_attempted, note_added, calculator_opened"
```

---

### Task 15: Wire health + resilience emits

**Files:**
- Modify: `extension/src/entrypoints/content.ts`
- Test: `extension/src/entrypoints/content.test.ts` (add cases)

**Interfaces:**
- Produces: emits at `dom_contract_failed` (in `handleQuestion` failure branch), `block_detected` + `killswitch_activated` (in `guardedStart`), `unscored_fallback` (when `result.graded === false` in `onCheck`), and a boot-level `js_error` + `unhandledrejection` listener.

- [ ] **Step 1: Write the failing test** — add to `content.test.ts`:

```ts
it('emits dom_contract_failed when the contract check fails', async () => {
  const sent: any[] = [];
  (globalThis as any).chrome = { ...(globalThis as any).chrome, runtime: { id: 'x', sendMessage: (m: any) => sent.push(m) } };
  const shadow = document.createElement('div').attachShadow({ mode: 'open' });
  await handleQuestion(shadow, null, () => {}); // null view → contract fails
  expect(sent.some((m) => m?.event?.event === 'dom_contract_failed')).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd extension && npx vitest run src/entrypoints/content.test.ts`
Expected: FAIL — no `dom_contract_failed` emitted.

- [ ] **Step 3: Write minimal implementation** — edit `content.ts`:

3a. Add to the events import: `DOM_CONTRACT_FAILED, BLOCK_DETECTED, KILLSWITCH_ACTIVATED, UNSCORED_FALLBACK, JS_ERROR`.

3b. In `handleQuestion` failure branch (after `renderBanner(shadow)`, line 153):

```ts
    emit({ event: DOM_CONTRACT_FAILED, props: { failure_reason: checkContract(view).reason ?? 'unreadable', question_id: view?.id ?? null } });
```

3c. In `guardedStart` (lines 166–169):

```ts
  if (!(await isEnabled())) { emit({ event: KILLSWITCH_ACTIVATED, props: {} }); return; }
  if (detectBlock(doc) !== null) {
    emit({ event: BLOCK_DETECTED, props: { block_reason: detectBlock(doc) ?? 'forbidden' } });
    renderBlockNotice(mountHost(doc));
    return;
  }
```

> Note: these two emit *before* the kill-switch can fully gate the overlay, but they still pass the background's own `isTelemetryEnabled()` (opt-in) gate — health events are NOT exempt from consent, only from the overlay being disabled. `block_reason` must be one of the allowlisted enum values; map `detectBlock`'s `BlockReason` to `access-denied|rate-limited|forbidden` if its raw values differ.

3d. In `onCheck`, where a non-graded result is rendered (the `renderVerdict` path when `result.graded === false`, around line 307):

```ts
    if (!result.graded) emit({ event: UNSCORED_FALLBACK, props: { session_id: session?.sessionId ?? '', question_id: view.id } });
```

3e. In the boot block (line 425), wrap and add a global handler:

```ts
  self.addEventListener?.('unhandledrejection', () => emit({ event: JS_ERROR, props: { component: 'unhandledrejection', error_code: 'BOOT_FAILURE' } }));
  void guardedStart(document, async () => {
    try {
      const db = await openStore();
      await runLoop(document, db, deviceId());
      mountPanelToggle(document, () => void handleMessage(db, { type: OPEN_JOURNAL }));
      watchResultsList(document, db);
      chrome.runtime.onMessage.addListener((m: { type?: string }) => { void handleMessage(db, m); });
    } catch { emit({ event: JS_ERROR, props: { component: 'boot', error_code: 'BOOT_FAILURE' } }); }
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd extension && npx vitest run src/entrypoints/content.test.ts && npx vitest run`
Expected: new test PASSES, full suite green.

- [ ] **Step 5: Commit**

```bash
git add extension/src/entrypoints/content.ts extension/src/entrypoints/content.test.ts
git commit -m "feat(telemetry): emit dom_contract_failed, block_detected, killswitch, unscored_fallback, js_error"
```

---

### Task 16: Popup consent UI (toggle + 13+ attestation + delete)

**Files:**
- Modify: `extension/src/entrypoints/popup.ts`
- Test: `extension/src/entrypoints/popup.test.ts` (add cases)

**Interfaces:**
- Consumes: `optIn`, `isOptedIn` (consent); `optOut` (lifecycle); `TELEMETRY_DELETE` (messages).
- Produces: a consent section in the popup — an "I'm 13 or older" checkbox that gates an analytics toggle; toggling on calls `optIn()`, off calls `optOut()`; a "Delete my analytics data" button posts `TELEMETRY_DELETE` to the background. Plain-language copy naming PostHog (US) and "never the questions or anything identifying you."

- [ ] **Step 1: Write the failing test** — add to `popup.test.ts`:

```ts
import { renderPopup } from './popup';

it('renders an opt-in analytics toggle gated by a 13+ attestation', () => {
  const root = document.createElement('div');
  renderPopup(root);
  expect(root.querySelector('.fp-telemetry-age')).toBeTruthy();
  const toggle = root.querySelector<HTMLInputElement>('.fp-telemetry-toggle');
  expect(toggle).toBeTruthy();
  expect(toggle!.disabled).toBe(true); // disabled until 13+ is checked
  expect(root.querySelector('.fp-telemetry-delete')).toBeTruthy();
  expect(root.textContent).toMatch(/PostHog/);
  expect(root.textContent).toMatch(/never the questions|nothing that identifies you/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd extension && npx vitest run src/entrypoints/popup.test.ts`
Expected: FAIL — no `.fp-telemetry-toggle`.

- [ ] **Step 3: Write minimal implementation** — in `popup.ts`, import and append a consent block inside `renderPopup` before `root.append(...)`:

```ts
import { optIn, isOptedIn } from '../telemetry/consent';
import { optOut } from '../telemetry/lifecycle';
import { TELEMETRY_DELETE } from '../messages';
```

```ts
  // Opt-in analytics (spec 2026-06-17): OFF by default, gated behind a 13+ attestation.
  const tele = document.createElement('section');
  tele.className = 'fp-telemetry';
  const blurb = document.createElement('p');
  blurb.textContent =
    'Optional: help improve this tool by sharing anonymous usage (which questions you practice and ' +
    'whether you got them right) with our analytics provider, PostHog (a US company). We never send ' +
    'the questions themselves, your notes, or anything that identifies you. Turn it off or delete your ' +
    'data anytime.';

  const ageLabel = document.createElement('label');
  const age = document.createElement('input');
  age.type = 'checkbox'; age.className = 'fp-telemetry-age';
  ageLabel.append(age, document.createTextNode(" I'm 13 or older"));

  const toggleLabel = document.createElement('label');
  const toggle = document.createElement('input');
  toggle.type = 'checkbox'; toggle.className = 'fp-telemetry-toggle'; toggle.disabled = true;
  toggleLabel.append(toggle, document.createTextNode(' Share anonymous usage analytics'));

  const del = document.createElement('button');
  del.className = 'fp-telemetry-delete'; del.textContent = 'Delete my analytics data';

  age.addEventListener('change', () => { toggle.disabled = !age.checked; });
  toggle.addEventListener('change', () => { void (toggle.checked ? optIn() : optOut()); });
  del.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) chrome.runtime.sendMessage({ type: TELEMETRY_DELETE });
    toggle.checked = false;
  });

  // Reflect current state when the popup opens.
  void isOptedIn().then((on) => { if (on) { age.checked = true; toggle.disabled = false; toggle.checked = true; } });

  tele.append(blurb, ageLabel, toggleLabel, del);
```

Then add `tele` to the final append: `root.append(link, journal, tele, notice);`

- [ ] **Step 4: Run test to verify it passes**

Run: `cd extension && npx vitest run src/entrypoints/popup.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/src/entrypoints/popup.ts extension/src/entrypoints/popup.test.ts
git commit -m "feat(telemetry): popup consent UI (13+ gate, opt-in toggle, delete button)"
```

---

### Task 17: Manifest permissions (all three variants)

**Files:**
- Modify: `extension/manifest.json`, `extension/manifest.firefox.json`, `extension/manifest.edge.json`
- Test: `extension/tests/manifest.test.ts` (add cases)

**Interfaces:**
- Produces: `alarms` in `permissions`; `https://us.i.posthog.com/*` and `https://api.focusedpractice.app/*` in `host_permissions`, in every variant.

- [ ] **Step 1: Write the failing test** — add to `extension/tests/manifest.test.ts` (follow the file's existing manifest-loading helper):

```ts
for (const file of ['manifest.json', 'manifest.firefox.json', 'manifest.edge.json']) {
  it(`${file} grants telemetry egress + alarms`, () => {
    const m = loadManifest(file); // use the helper this test file already defines
    expect(m.permissions).toContain('alarms');
    expect(m.host_permissions).toContain('https://us.i.posthog.com/*');
    expect(m.host_permissions).toContain('https://api.focusedpractice.app/*');
  });
}
```

> If `manifest.test.ts` has no `loadManifest` helper, read each file with `JSON.parse(readFileSync(...))` as the other tests in that file do.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd extension && npx vitest run tests/manifest.test.ts`
Expected: FAIL — permissions/hosts missing.

- [ ] **Step 3: Write minimal implementation** — in each of the three manifest files:

`permissions` becomes:
```json
  "permissions": ["storage", "alarms"],
```
`host_permissions` becomes (keep the existing CB + config entries; add the two telemetry hosts):
```json
  "host_permissions": [
    "*://satsuiteeducatorquestionbank.collegeboard.org/*",
    "https://config.focusedpractice.app/*",
    "https://us.i.posthog.com/*",
    "https://api.focusedpractice.app/*"
  ],
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd extension && npx vitest run tests/manifest.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/manifest.json extension/manifest.firefox.json extension/manifest.edge.json extension/tests/manifest.test.ts
git commit -m "feat(telemetry): manifest host_permissions for PostHog + deletion endpoint, alarms"
```

---

### Task 18: Extend the CI egress guard

**Files:**
- Modify: `extension/tests/guard-ci.test.ts`

**Interfaces:**
- Produces: the egress allowlist expands from "config host only" to `{config.focusedpractice.app, us.i.posthog.com, api.focusedpractice.app}`; `collegeboard.org` / `qbank-api` remain forbidden everywhere; a new assertion forbids any `phx_` (private-key) literal.

- [ ] **Step 1: Write the failing assertion** — in `guard-ci.test.ts`, replace the single-host check with an allowlist and add a private-key check.

Replace:
```ts
const OUR_CONFIG_HOST = 'config.focusedpractice.app';
```
with:
```ts
// Allowed egress hosts (spec 2026-06-17): our config host, PostHog US ingestion, our deletion endpoint.
// Every fetched http(s) literal must target one of these; CB is forbidden everywhere.
const ALLOWED_EGRESS_HOSTS = ['config.focusedpractice.app', 'us.i.posthog.com', 'api.focusedpractice.app'];
```

Replace the per-literal assertion inside the `for (const m of code.matchAll(FETCH_LITERAL))` block:
```ts
          expect(target, `fetch target ${target} must be OUR config host`).toContain(OUR_CONFIG_HOST);
```
with:
```ts
          expect(ALLOWED_EGRESS_HOSTS.some((h) => target.includes(h)), `fetch target ${target} must be an allowed egress host`).toBe(true);
```

Add, inside the per-file `it(...)` body (after the existing assertions):
```ts
      expect(code, 'must never bundle a PostHog PRIVATE key (phx_)').not.toMatch(/phx_/);
```

- [ ] **Step 2: Run test to verify it passes with the new telemetry code present**

Run: `cd extension && npx vitest run tests/guard-ci.test.ts`
Expected: PASS — `transport.ts`/`delete.ts`/`consent.ts` fetch the allowed hosts; no `phx_` anywhere; no CB calls. (If it FAILS, a telemetry fetch is pointing somewhere off-allowlist — fix the code, not the guard.)

- [ ] **Step 3: Run the full suite + typecheck**

Run: `cd extension && npx vitest run && npm run typecheck`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add extension/tests/guard-ci.test.ts
git commit -m "test(telemetry): extend CI egress guard to PostHog + deletion hosts; forbid phx_ keys"
```

---

### Task 19: Build verification

**Files:** none (verification only).

- [ ] **Step 1: Typecheck + full test run**

Run: `cd extension && npm run typecheck && npm test`
Expected: 0 type errors; all tests pass (≈229 prior + the new telemetry suites).

- [ ] **Step 2: Build all three targets**

Run: `cd extension && npm run build && npm run build:firefox && npm run build:edge`
Expected: each bundle builds clean; `dist*/background.js` and `content.js` exist.

- [ ] **Step 3: Grep the built bundles for leaks (manual gate)**

Run: `cd extension && grep -RinE 'phx_|collegeboard\.org' dist* || echo "clean: no private key, no CB host in egress"`
Expected: no `phx_`; the only `collegeboard.org` matches (if any) are the content-script *match* host, never a `fetch(` target.

- [ ] **Step 4: Commit (if any incidental fixes were needed)**

```bash
git add -A && git commit -m "chore(telemetry): typecheck + tri-browser build green" || echo "nothing to commit"
```

---

## Self-Review

**1. Spec coverage:**
- Opt-in/no-PII/no-content → Tasks 2 (scrubber), 5 (consent), 10 (authoritative re-scrub). ✓
- Event taxonomy + bucketing + session_id + reveal_used → Tasks 3, 4, 14, 15. ✓
- PostHog US batch shape + token + $ip/$process → Tasks 1, 6, 10. ✓
- install_id lifecycle, opt-out order, reset, delete → Tasks 5, 11, 12. ✓
- Background single-egress + alarms flush + Firefox (alarms + opportunistic flush on each message) → Task 13. ✓
- Consent UI (13+ gate, toggle, delete) → Task 16. ✓
- Manifest hosts/alarms (3 variants) + CI egress guard + phx_ ban → Tasks 17, 18. ✓
- 12-month retention + IP/autocapture off → **PostHog project config, out of scope for code** (noted at top). ✓ (operational)
- Deletion Worker → **separate plan** (client call covered in Task 11). ✓
- `onboarding_shown` event: **deliberately not implemented** — under opt-in-OFF-by-default it can never fire before consent exists; the opt-in toggle itself is the signal. Documented deviation.

**2. Placeholder scan:** the `phc_` token is no longer hardcoded — it's build-time injected from a gitignored `extension/.env` (Task 1), so there is no placeholder string in source. Every step has real code/commands.

**3. Type consistency:** `TelemetryEvent {event, props}` (Task 4) is consumed unchanged by `emit` (9), `ingest` (10), `background` (13). `QueuedEvent {event, timestamp, properties}` (Task 6) is consumed by `queue` (7) and produced by `ingest` (10)/`lifecycle` (12). `isTelemetryEnabled`/`getInstallId`/`clearLocalTelemetry` (Task 5) are consumed by 10/11/12 with matching signatures. Builders' return type matches `emit`'s parameter (incl. the `| null` for empty notes). ✓
