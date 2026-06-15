# SAT Practice Overlay — Plan 1: Foundation & DOM-Contract

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the extension project and build + test the foundation — the legal CI guard, the local data layer, the pure logic (scoring/stats/merge), and the CB-DOM reader/observer verified against synthetic fixtures — then validate the DOM contract on the live site.

**Architecture:** A Manifest V3 browser extension. This plan builds the non-UI core: an IndexedDB store that *physically cannot* persist question content (a guard throws on any non-allowlisted field), pure functions for scoring/stats/sync-merge, and an isolated CB-DOM reader+observer. All "what CB's HTML looks like" knowledge lives in `src/cb/` only. No `qbank-api` / `collegeboard.org` network calls — ever (enforced by a build-failing test).

**Tech Stack:** TypeScript · esbuild (bundling) · Vitest + happy-dom (tests) · fake-indexeddb (store tests) · idb (IndexedDB wrapper). Code lives under `extension/`.

**Spec:** `docs/superpowers/specs/2026-06-15-sat-practice-overlay-design.md`

**This is Plan 1 of 4** (per the spec's build sequence §12):
1. **Foundation & DOM-contract** ← this plan
2. The scored loop — Shadow-DOM overlay, focus card, answer/cross-off/check/score/explanation/next, randomize, calculator (GeoGebra + Open-real-Desmos)
3. Journal, progress, re-surface badger, guided resume (toolbar panel)
4. Resilience (kill-switch, 403 detection, DOM-contract self-check) + cross-browser packaging + privacy/non-affiliation

**Legal invariant enforced throughout:** only `{question IDs + the student's own data}` may persist; the CB DOM is read in RAM and discarded; never call `qbank-api`; synthetic fixtures only (never commit real CB question text).

---

## File structure (created by this plan)

```
extension/
  package.json
  tsconfig.json
  vitest.config.ts
  manifest.json                 # MV3 (Chrome); name avoids "SAT"/"College Board"
  scripts/build.mjs             # esbuild bundler (background + content)
  src/
    types.ts                    # data-model types + sync envelope
    model.ts                    # ids, timestamps, record factories
    guard.ts                    # assertNoQuestionContent — the legal guard
    store.ts                    # idb wrapper: recordAttempt/saveNote/saveSession/getters
    scoring.ts                  # score(pick, correctAnswer)
    stats.ts                    # deriveStats(attempts)
    merge.ts                    # mergeRecord/mergeCollections (v2 sync forward-compat)
    cb/
      reader.ts                 # readQuestion(root) → QuestionView (isolated CB-DOM knowledge)
      observer.ts               # observeQuestions(doc, onShown)
      __fixtures__/
        multiple-choice.html    # SYNTHETIC CB-like DOM (fake question text)
        grid-in.html            # SYNTHETIC CB-like DOM (fake question text)
    entrypoints/
      background.ts             # minimal service worker (proof of life)
      content.ts                # minimal: observe questions, log detected IDs (spike wiring)
  src/**/*.test.ts              # co-located unit tests
  tests/
    guard-ci.test.ts           # source scan: no qbank-api / no fetch to collegeboard.org
```

`crypto.randomUUID()` and `new Date()` are used in app code (allowed — the Workflow-sandbox restriction does not apply here). Tests use `vi.useFakeTimers()` where determinism matters.

---

## Task 1: Project scaffold + smoke test

**Files:**
- Create: `extension/package.json`, `extension/tsconfig.json`, `extension/vitest.config.ts`, `extension/scripts/build.mjs`, `extension/manifest.json`, `extension/src/smoke.test.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Add ignores for the node project**

Append to the repo-root `.gitignore`:
```
extension/node_modules/
extension/dist/
```

- [ ] **Step 2: Create `extension/package.json`**

```json
{
  "name": "sat-overlay",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node scripts/build.mjs",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.268",
    "esbuild": "^0.24.0",
    "fake-indexeddb": "^6.0.0",
    "happy-dom": "^15.0.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  },
  "dependencies": {
    "idb": "^8.0.0"
  }
}
```

- [ ] **Step 3: Create `extension/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["chrome", "vitest/globals"],
    "noEmit": true
  },
  "include": ["src", "scripts", "tests"]
}
```

- [ ] **Step 4: Create `extension/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 5: Create `extension/scripts/build.mjs`**

```js
import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';

await mkdir('dist', { recursive: true });
await build({
  entryPoints: {
    background: 'src/entrypoints/background.ts',
    content: 'src/entrypoints/content.ts',
  },
  outdir: 'dist',
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  legalComments: 'none',
});
await copyFile('manifest.json', 'dist/manifest.json');
console.log('Built extension to dist/');
```

- [ ] **Step 6: Create `extension/manifest.json`**

(Name deliberately avoids "SAT"/"College Board" as brand; nominative use + non-affiliation live in the description. Final brand name is a Plan 4 / store-hygiene decision.)
```json
{
  "manifest_version": 3,
  "name": "Focused Practice (dev)",
  "version": "0.0.1",
  "description": "A study companion that adds scoring, a mistake journal, and a calculator on top of the official SAT question bank. Not affiliated with, authorized, or endorsed by College Board; SAT is a trademark of the College Board.",
  "permissions": ["storage"],
  "host_permissions": ["*://satsuiteeducatorquestionbank.collegeboard.org/*"],
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

- [ ] **Step 7: Create the smoke test `extension/src/smoke.test.ts`**

```ts
import { describe, it, expect } from 'vitest';

describe('toolchain smoke', () => {
  it('runs vitest with happy-dom (document exists)', () => {
    expect(typeof document).toBe('object');
    expect(typeof crypto.randomUUID).toBe('function');
  });
});
```

- [ ] **Step 8: Install, run the smoke test, verify it passes**

Run:
```bash
cd extension && npm install && npm test
```
Expected: `smoke.test.ts` PASSES (1 passed). `crypto.randomUUID` is a function.

- [ ] **Step 9: Commit**

```bash
git add extension/.gitignore .gitignore extension/package.json extension/package-lock.json extension/tsconfig.json extension/vitest.config.ts extension/scripts/build.mjs extension/manifest.json extension/src/smoke.test.ts
git commit -m "chore(extension): scaffold MV3 project (TS + esbuild + vitest)"
```

---

## Task 2: Data-model types + record factories

**Files:**
- Create: `extension/src/types.ts`, `extension/src/model.ts`, `extension/src/model.test.ts`

- [ ] **Step 1: Write the failing test `extension/src/model.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeAttempt, makeNote, makeSession, SCHEMA_VERSION } from './model';

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-15T00:00:00.000Z')); });
afterEach(() => { vi.useRealTimers(); });

describe('record factories', () => {
  it('makeAttempt populates the sync envelope + fields', () => {
    const a = makeAttempt({
      deviceId: 'dev-1', questionId: 'ac472881', section: 'Math', domain: 'Algebra',
      skill: 'Linear equations in one variable', difficulty: 'Hard', pick: 'B', correct: true,
    });
    expect(a.attemptId).toMatch(/[0-9a-f-]{36}/);
    expect(a.userId).toBeNull();
    expect(a.deviceId).toBe('dev-1');
    expect(a.questionId).toBe('ac472881');
    expect(a.correct).toBe(true);
    expect(a.deleted).toBe(false);
    expect(a.dirty).toBe(true);
    expect(a.schemaVersion).toBe(SCHEMA_VERSION);
    expect(a.createdAt).toBe('2026-06-15T00:00:00.000Z');
    expect(a.updatedAt).toBe('2026-06-15T00:00:00.000Z');
  });

  it('makeNote and makeSession share the envelope shape', () => {
    const n = makeNote({ deviceId: 'd', questionId: 'q1', text: 'missed the trap' });
    expect(n.noteId).toMatch(/[0-9a-f-]{36}/);
    expect(n.text).toBe('missed the trap');
    const s = makeSession({ deviceId: 'd', filterContext: 'SAT|Math|Algebra|Hard', orderMode: 'random', shuffleSeed: 7 });
    expect(s.filterContext).toBe('SAT|Math|Algebra|Hard');
    expect(s.orderMode).toBe('random');
    expect(s.lastQuestionId).toBeNull();
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `cd extension && npx vitest run src/model.test.ts`
Expected: FAIL — cannot import from `./model` (module/exports not found).

- [ ] **Step 3: Create `extension/src/types.ts`**

```ts
export type ISO = string;
export type UUID = string;

export interface Envelope {
  userId: string | null;
  deviceId: UUID;
  createdAt: ISO;
  updatedAt: ISO;
  deleted: boolean;
  dirty: boolean;
  schemaVersion: number;
}

export interface Attempt extends Envelope {
  attemptId: UUID;
  questionId: string;
  section: string;
  domain: string;
  skill: string;
  difficulty: string;
  pick: string;        // "A".."D" for MC, or the grid-in value
  correct: boolean;
}

export interface Note extends Envelope {
  noteId: UUID;
  questionId: string;
  text: string;
}

export interface Session extends Envelope {
  sessionId: UUID;
  filterContext: string;            // e.g. "SAT|Math|Algebra|Hard"
  orderMode: 'list' | 'random';
  shuffleSeed: number;
  lastQuestionId: string | null;
}
```

- [ ] **Step 4: Create `extension/src/model.ts`**

```ts
import type { Attempt, Note, Session, Envelope, UUID, ISO } from './types';

export const SCHEMA_VERSION = 1;

export const newId = (): UUID => crypto.randomUUID();
export const nowIso = (): ISO => new Date().toISOString();

function envelope(deviceId: UUID, at: ISO): Envelope {
  return { userId: null, deviceId, createdAt: at, updatedAt: at, deleted: false, dirty: true, schemaVersion: SCHEMA_VERSION };
}

export interface NewAttempt {
  deviceId: UUID; questionId: string; section: string; domain: string;
  skill: string; difficulty: string; pick: string; correct: boolean;
}
export function makeAttempt(i: NewAttempt): Attempt {
  const at = nowIso();
  return { attemptId: newId(), questionId: i.questionId, section: i.section, domain: i.domain,
    skill: i.skill, difficulty: i.difficulty, pick: i.pick, correct: i.correct, ...envelope(i.deviceId, at) };
}

export function makeNote(i: { deviceId: UUID; questionId: string; text: string }): Note {
  const at = nowIso();
  return { noteId: newId(), questionId: i.questionId, text: i.text, ...envelope(i.deviceId, at) };
}

export function makeSession(i: { deviceId: UUID; filterContext: string; orderMode: 'list' | 'random'; shuffleSeed: number }): Session {
  const at = nowIso();
  return { sessionId: newId(), filterContext: i.filterContext, orderMode: i.orderMode,
    shuffleSeed: i.shuffleSeed, lastQuestionId: null, ...envelope(i.deviceId, at) };
}
```

- [ ] **Step 5: Run it; verify it passes**

Run: `cd extension && npx vitest run src/model.test.ts`
Expected: PASS (2 passed).

- [ ] **Step 6: Commit**

```bash
git add extension/src/types.ts extension/src/model.ts extension/src/model.test.ts
git commit -m "feat(extension): data-model types + record factories with sync envelope"
```

---

## Task 3: The legal guard — `assertNoQuestionContent`

This is the legal-critical unit: it makes it *impossible* to persist anything but allowlisted IDs + the student's own data.

**Files:**
- Create: `extension/src/guard.ts`, `extension/src/guard.test.ts`

- [ ] **Step 1: Write the failing test `extension/src/guard.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { assertNoQuestionContent, QuestionContentError } from './guard';

describe('assertNoQuestionContent', () => {
  it('accepts an allowlisted attempt record', () => {
    expect(() => assertNoQuestionContent({
      attemptId: 'a', userId: null, deviceId: 'd', questionId: 'ac472881',
      section: 'Math', domain: 'Algebra', skill: 'Linear equations', difficulty: 'Hard',
      pick: 'B', correct: true, createdAt: 't', updatedAt: 't', deleted: false, dirty: true, schemaVersion: 1,
    })).not.toThrow();
  });

  it('rejects a record carrying question text under a non-allowlisted key', () => {
    expect(() => assertNoQuestionContent({ questionId: 'x', questionText: 'If 3x+7=22...' }))
      .toThrow(QuestionContentError);
  });

  it('rejects choices/passage/explanation fields outright', () => {
    for (const key of ['choices', 'passage', 'explanation', 'correctAnswer', 'stem', 'rationale']) {
      expect(() => assertNoQuestionContent({ questionId: 'x', [key]: 'anything' })).toThrow(QuestionContentError);
    }
  });

  it('rejects an over-long note (likely pasted question content)', () => {
    expect(() => assertNoQuestionContent({ noteId: 'n', questionId: 'q', text: 'a'.repeat(2001) }))
      .toThrow(QuestionContentError);
  });

  it('rejects an over-long pick', () => {
    expect(() => assertNoQuestionContent({ questionId: 'q', pick: 'a'.repeat(201) })).toThrow(QuestionContentError);
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `cd extension && npx vitest run src/guard.test.ts`
Expected: FAIL — `./guard` not found.

- [ ] **Step 3: Create `extension/src/guard.ts`**

```ts
// LEGAL INVARIANT GUARD.
// Only IDs + the student's own data may be persisted. Any non-allowlisted field, or a
// suspiciously long string, throws — so a bug can never silently store CB question content.
const ALLOWED_KEYS = new Set<string>([
  // envelope
  'userId', 'deviceId', 'createdAt', 'updatedAt', 'deleted', 'dirty', 'schemaVersion',
  // attempt
  'attemptId', 'questionId', 'section', 'domain', 'skill', 'difficulty', 'pick', 'correct',
  // note
  'noteId', 'text',
  // session
  'sessionId', 'filterContext', 'orderMode', 'shuffleSeed', 'lastQuestionId',
]);

const MAX_LEN: Record<string, number> = {
  text: 2000,          // the student's own free-text note — bounded
  pick: 200,           // grid-in values are short; long => suspicious
  questionId: 64,
  skill: 200, domain: 200, section: 64, difficulty: 32, filterContext: 256,
};

export class QuestionContentError extends Error {
  constructor(message: string) { super(message); this.name = 'QuestionContentError'; }
}

export function assertNoQuestionContent(record: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(record)) {
    if (!ALLOWED_KEYS.has(key)) {
      throw new QuestionContentError(`Disallowed field "${key}": only IDs + the student's own data may be stored`);
    }
    if (typeof value === 'string') {
      const limit = MAX_LEN[key];
      if (limit !== undefined && value.length > limit) {
        throw new QuestionContentError(`Field "${key}" exceeds ${limit} chars — possible question content`);
      }
    }
  }
}
```

- [ ] **Step 4: Run it; verify it passes**

Run: `cd extension && npx vitest run src/guard.test.ts`
Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
git add extension/src/guard.ts extension/src/guard.test.ts
git commit -m "feat(extension): legal guard rejecting any non-allowlisted/oversized field"
```

---

## Task 4: Local store (IndexedDB via idb), guarded

**Files:**
- Create: `extension/src/store.ts`, `extension/src/store.test.ts`

- [ ] **Step 1: Write the failing test `extension/src/store.test.ts`**

```ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { openStore, recordAttempt, getAttempts, saveNote, getNotes, saveSession, getSession } from './store';
import { makeAttempt, makeNote, makeSession } from './model';
import { QuestionContentError } from './guard';
import { indexedDB } from 'fake-indexeddb';

async function freshDb() {
  await new Promise<void>((res) => { const r = indexedDB.deleteDatabase('sat-overlay'); r.onsuccess = () => res(); r.onerror = () => res(); });
  return openStore();
}

describe('local store', () => {
  it('records and reads back an attempt', async () => {
    const db = await freshDb();
    const a = makeAttempt({ deviceId: 'd', questionId: 'ac472881', section: 'Math', domain: 'Algebra', skill: 'Linear equations', difficulty: 'Hard', pick: 'B', correct: true });
    await recordAttempt(db, a);
    const all = await getAttempts(db);
    expect(all).toHaveLength(1);
    expect(all[0]!.questionId).toBe('ac472881');
  });

  it('rejects a write that smuggles question content (guard fires before persistence)', async () => {
    const db = await freshDb();
    const bad = { ...makeAttempt({ deviceId: 'd', questionId: 'q', section: 'Math', domain: 'Algebra', skill: 'x', difficulty: 'Hard', pick: 'B', correct: false }), passage: 'If 3x+7=22 ...' };
    await expect(recordAttempt(db, bad as never)).rejects.toBeInstanceOf(QuestionContentError);
    expect(await getAttempts(db)).toHaveLength(0);
  });

  it('saves/reads a note and a session (session keyed by filterContext)', async () => {
    const db = await freshDb();
    await saveNote(db, makeNote({ deviceId: 'd', questionId: 'q1', text: 'trap' }));
    expect((await getNotes(db))[0]!.text).toBe('trap');
    const s = makeSession({ deviceId: 'd', filterContext: 'SAT|Math|Algebra|Hard', orderMode: 'random', shuffleSeed: 3 });
    await saveSession(db, s);
    expect((await getSession(db, 'SAT|Math|Algebra|Hard'))!.shuffleSeed).toBe(3);
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `cd extension && npx vitest run src/store.test.ts`
Expected: FAIL — `./store` not found.

- [ ] **Step 3: Create `extension/src/store.ts`**

```ts
import { openDB, type IDBPDatabase } from 'idb';
import { assertNoQuestionContent } from './guard';
import type { Attempt, Note, Session } from './types';

const DB_NAME = 'sat-overlay';
const DB_VERSION = 1;

export async function openStore(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('attempts')) {
        const s = db.createObjectStore('attempts', { keyPath: 'attemptId' });
        s.createIndex('byQuestion', 'questionId');
      }
      if (!db.objectStoreNames.contains('notes')) db.createObjectStore('notes', { keyPath: 'noteId' });
      if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'filterContext' });
    },
  });
}

export async function recordAttempt(db: IDBPDatabase, a: Attempt): Promise<void> {
  assertNoQuestionContent(a as unknown as Record<string, unknown>);
  await db.put('attempts', a);
}
export async function getAttempts(db: IDBPDatabase): Promise<Attempt[]> {
  return db.getAll('attempts') as Promise<Attempt[]>;
}

export async function saveNote(db: IDBPDatabase, n: Note): Promise<void> {
  assertNoQuestionContent(n as unknown as Record<string, unknown>);
  await db.put('notes', n);
}
export async function getNotes(db: IDBPDatabase): Promise<Note[]> {
  return db.getAll('notes') as Promise<Note[]>;
}

export async function saveSession(db: IDBPDatabase, s: Session): Promise<void> {
  assertNoQuestionContent(s as unknown as Record<string, unknown>);
  await db.put('sessions', s);
}
export async function getSession(db: IDBPDatabase, filterContext: string): Promise<Session | undefined> {
  return db.get('sessions', filterContext) as Promise<Session | undefined>;
}
```

- [ ] **Step 4: Run it; verify it passes**

Run: `cd extension && npx vitest run src/store.test.ts`
Expected: PASS (3 passed) — including that the smuggled-content write rejects AND leaves the store empty.

- [ ] **Step 5: Commit**

```bash
git add extension/src/store.ts extension/src/store.test.ts
git commit -m "feat(extension): guarded IndexedDB store for attempts/notes/sessions"
```

---

## Task 5: Scoring engine

**Files:**
- Create: `extension/src/scoring.ts`, `extension/src/scoring.test.ts`

- [ ] **Step 1: Write the failing test `extension/src/scoring.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { score } from './scoring';

describe('score', () => {
  it('multiple-choice: case-insensitive letter compare, graded', () => {
    expect(score('B', 'B')).toEqual({ graded: true, correct: true });
    expect(score('b', 'B')).toEqual({ graded: true, correct: true });
    expect(score('C', 'B')).toEqual({ graded: true, correct: false });
  });

  it('grid-in: exact numeric and fraction equivalence', () => {
    expect(score('5', '5')).toEqual({ graded: true, correct: true });
    expect(score('2.5', '5/2')).toEqual({ graded: true, correct: true });
    expect(score('3/6', '1/2')).toEqual({ graded: true, correct: true });
    expect(score('7', '5')).toEqual({ graded: true, correct: false });
  });

  it('grid-in: multiple acceptable forms listed by CB', () => {
    expect(score('.333', '1/3, .333, .3333')).toEqual({ graded: true, correct: true });
    expect(score('.3333', '1/3, .333, .3333')).toEqual({ graded: true, correct: true });
    expect(score('5/2', '2.5 or 5/2')).toEqual({ graded: true, correct: true });
  });

  it('grid-in: accepts SAT round/truncate of a non-terminating decimal (>= 3 digits)', () => {
    expect(score('.333', '1/3')).toEqual({ graded: true, correct: true });   // truncated to fit
    expect(score('.667', '2/3')).toEqual({ graded: true, correct: true });   // rounded to fit
    expect(score('.3', '1/3')).toEqual({ graded: true, correct: false });    // under-filled => wrong
  });

  it('never guesses: indeterminate when the format is unexpected', () => {
    expect(score('', 'B')).toEqual({ graded: false, correct: false });
    expect(score('hello', '5')).toEqual({ graded: false, correct: false });
    expect(score('5', '')).toEqual({ graded: false, correct: false });
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `cd extension && npx vitest run src/scoring.test.ts`
Expected: FAIL — `./scoring` not found.

- [ ] **Step 3: Create `extension/src/scoring.ts`**

```ts
export interface ScoreResult {
  graded: boolean;   // false => indeterminate; the loop shows CB's answer with NO red/green verdict
  correct: boolean;  // meaningful only when graded === true
}

// SAT answers are multiple-choice (a single letter) or student-produced response (grid-in).
// CB's correct-answer string may list several acceptable forms ("1/3, .333, .3333"). We grade
// only when confident; any unexpected format returns { graded:false } so we NEVER show a wrong
// verdict (the OnePrep trust-killer). Tolerances are calibrated against real CB grid-in answers
// during the live spike (Task 12).
export function score(pick: string, correctAnswerRaw: string): ScoreResult {
  const a = pick.trim();
  const accepted = splitAnswers(correctAnswerRaw);
  if (a === '' || accepted.length === 0) return { graded: false, correct: false };

  // Multiple-choice
  if (accepted.some(isChoiceLetter) || isChoiceLetter(a)) {
    if (!isChoiceLetter(a)) return { graded: false, correct: false };
    return { graded: true, correct: accepted.some((x) => x.toUpperCase() === a.toUpperCase()) };
  }

  // Grid-in (numeric / fraction, possibly multiple acceptable forms)
  const pv = parseNumeric(a);
  const targets = accepted.map(parseNumeric).filter((n): n is number => n !== null);
  if (pv === null || targets.length === 0) {
    return accepted.includes(a) ? { graded: true, correct: true } : { graded: false, correct: false };
  }
  return { graded: true, correct: targets.some((t) => numericAccept(a, pv, t)) };
}

function splitAnswers(raw: string): string[] {
  return raw.split(/[,;]|\bor\b/i).map((s) => s.trim()).filter(Boolean);
}

function isChoiceLetter(s: string): boolean { return /^[A-D]$/i.test(s.trim()); }

function parseNumeric(s: string): number | null {
  const t = s.trim();
  if (/^-?\d+(\.\d+)?$/.test(t)) return parseFloat(t);
  const f = t.match(/^(-?\d+)\s*\/\s*(\d+)$/);
  if (f) { const d = parseInt(f[2]!, 10); return d === 0 ? null : parseInt(f[1]!, 10) / d; }
  return null;
}

// Exact match, or — for a non-terminating decimal — the pick equals the target rounded OR
// truncated to the pick's own decimal places, provided the pick carries >= 3 decimals
// (SAT requires filling the grid). Otherwise not accepted.
function numericAccept(pickStr: string, pickVal: number, target: number): boolean {
  if (Math.abs(pickVal - target) < 1e-9) return true;
  const dec = (pickStr.split('.')[1] ?? '').length;
  if (dec >= 3) {
    const f = 10 ** dec;
    const rounded = Math.round(target * f) / f;
    const truncated = Math.trunc(target * f) / f;
    return Math.abs(pickVal - rounded) < 1e-9 || Math.abs(pickVal - truncated) < 1e-9;
  }
  return false;
}
```

- [ ] **Step 4: Run it; verify it passes**

Run: `cd extension && npx vitest run src/scoring.test.ts`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add extension/src/scoring.ts extension/src/scoring.test.ts
git commit -m "feat(extension): scoring engine (MC + grid-in multi/equivalence + never-guess fallback)"
```

---

## Task 6: Stats / weak-area derivation

**Files:**
- Create: `extension/src/stats.ts`, `extension/src/stats.test.ts`

- [ ] **Step 1: Write the failing test `extension/src/stats.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { deriveStats } from './stats';
import { makeAttempt } from './model';

function att(questionId: string, skill: string, correct: boolean, createdAt: string) {
  return { ...makeAttempt({ deviceId: 'd', questionId, section: 'Math', domain: 'Algebra', skill, difficulty: 'Hard', pick: 'B', correct }), createdAt };
}

describe('deriveStats', () => {
  it('uses the latest attempt per question and sorts skills worst-first', () => {
    const stats = deriveStats([
      att('q1', 'Inferences', false, '2026-06-10T00:00:00Z'),
      att('q1', 'Inferences', true,  '2026-06-12T00:00:00Z'), // latest wins → correct
      att('q2', 'Inferences', false, '2026-06-11T00:00:00Z'),
      att('q3', 'Linear equations', true, '2026-06-11T00:00:00Z'),
    ]);
    expect(stats.total).toBe(3);
    expect(stats.correct).toBe(2);
    expect(stats.perSkill[0]!.skill).toBe('Inferences'); // 1/2 = 50% worst
    expect(stats.perSkill[0]!.accuracy).toBeCloseTo(0.5);
    expect(stats.seen.q2).toBe('missed');
    expect(stats.seen.q1).toBe('done');
  });

  it('ignores tombstoned attempts', () => {
    const a = att('q1', 'X', true, '2026-06-10T00:00:00Z');
    const stats = deriveStats([{ ...a, deleted: true }]);
    expect(stats.total).toBe(0);
  });

  it('computes consecutive-day streak ending at the most recent active day', () => {
    const s = deriveStats([
      att('q1', 'X', true, '2026-06-13T10:00:00Z'),
      att('q2', 'X', true, '2026-06-12T10:00:00Z'),
      att('q3', 'X', true, '2026-06-11T10:00:00Z'),
      att('q4', 'X', true, '2026-06-08T10:00:00Z'), // gap → streak stops at 3
    ]);
    expect(s.streakDays).toBe(3);
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `cd extension && npx vitest run src/stats.test.ts`
Expected: FAIL — `./stats` not found.

- [ ] **Step 3: Create `extension/src/stats.ts`**

```ts
import type { Attempt } from './types';

export interface SkillStat { skill: string; total: number; correct: number; accuracy: number; }
export interface Stats {
  total: number; correct: number; accuracy: number;
  perSkill: SkillStat[];                       // worst accuracy first
  seen: Record<string, 'done' | 'missed'>;     // latest result per questionId
  streakDays: number;                          // consecutive active days ending at the most recent
}

export function deriveStats(attempts: Attempt[]): Stats {
  const latest = new Map<string, Attempt>();
  const days = new Set<string>();
  for (const a of attempts) {
    if (a.deleted) continue;
    days.add(a.createdAt.slice(0, 10));
    const prev = latest.get(a.questionId);
    if (!prev || a.createdAt > prev.createdAt) latest.set(a.questionId, a);
  }
  const list = [...latest.values()];
  const correct = list.filter((a) => a.correct).length;

  const bySkill = new Map<string, { t: number; c: number }>();
  const seen: Record<string, 'done' | 'missed'> = {};
  for (const a of list) {
    const s = bySkill.get(a.skill) ?? { t: 0, c: 0 };
    s.t++; if (a.correct) s.c++;
    bySkill.set(a.skill, s);
    seen[a.questionId] = a.correct ? 'done' : 'missed';
  }
  const perSkill = [...bySkill.entries()]
    .map(([skill, { t, c }]) => ({ skill, total: t, correct: c, accuracy: t ? c / t : 0 }))
    .sort((x, y) => x.accuracy - y.accuracy);

  return { total: list.length, correct, accuracy: list.length ? correct / list.length : 0, perSkill, seen, streakDays: streak(days) };
}

function streak(days: Set<string>): number {
  const sorted = [...days].sort().reverse();
  if (sorted.length === 0) return 0;
  let n = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = Date.parse(sorted[i - 1]! + 'T00:00:00Z');
    const cur = Date.parse(sorted[i]! + 'T00:00:00Z');
    if (prev - cur === 86_400_000) n++; else break;
  }
  return n;
}
```

- [ ] **Step 4: Run it; verify it passes**

Run: `cd extension && npx vitest run src/stats.test.ts`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add extension/src/stats.ts extension/src/stats.test.ts
git commit -m "feat(extension): stats/weak-area derivation (latest-per-question, worst-first)"
```

---

## Task 7: Sync-envelope merge (v2 forward-compat)

**Files:**
- Create: `extension/src/merge.ts`, `extension/src/merge.test.ts`

- [ ] **Step 1: Write the failing test `extension/src/merge.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { mergeRecord, mergeCollections } from './merge';
import type { Envelope } from './types';

type Row = Envelope & { id: string };
const row = (id: string, updatedAt: string, deleted = false): Row =>
  ({ id, updatedAt, deleted, userId: null, deviceId: 'd', createdAt: '2026-06-01T00:00:00Z', dirty: false, schemaVersion: 1 });

describe('merge (last-write-wins + tombstones)', () => {
  it('mergeRecord keeps the newer updatedAt', () => {
    expect(mergeRecord(row('a', '2026-06-10T00:00:00Z'), row('a', '2026-06-12T00:00:00Z'))!.updatedAt)
      .toBe('2026-06-12T00:00:00Z');
  });
  it('mergeRecord returns the present side when the other is undefined', () => {
    expect(mergeRecord(undefined, row('a', 't'))!.id).toBe('a');
    expect(mergeRecord(row('a', 't'), undefined)!.id).toBe('a');
  });
  it('mergeCollections unions by key and drops tombstoned winners', () => {
    const local = [row('a', '2026-06-10T00:00:00Z'), row('b', '2026-06-10T00:00:00Z')];
    const remote = [row('a', '2026-06-12T00:00:00Z', true), row('c', '2026-06-09T00:00:00Z')];
    const out = mergeCollections(local, remote, (r) => r.id).map((r) => r.id).sort();
    expect(out).toEqual(['b', 'c']); // 'a' won as a tombstone → removed
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `cd extension && npx vitest run src/merge.test.ts`
Expected: FAIL — `./merge` not found.

- [ ] **Step 3: Create `extension/src/merge.ts`**

```ts
import type { Envelope } from './types';

export function mergeRecord<T extends Envelope>(local: T | undefined, remote: T | undefined): T | undefined {
  if (!local) return remote;
  if (!remote) return local;
  return remote.updatedAt > local.updatedAt ? remote : local;
}

export function mergeCollections<T extends Envelope>(local: T[], remote: T[], keyOf: (r: T) => string): T[] {
  const byKey = new Map<string, T>();
  for (const r of local) byKey.set(keyOf(r), r);
  for (const r of remote) { const k = keyOf(r); byKey.set(k, mergeRecord(byKey.get(k), r)!); }
  return [...byKey.values()].filter((r) => !r.deleted);
}
```

- [ ] **Step 4: Run it; verify it passes**

Run: `cd extension && npx vitest run src/merge.test.ts`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add extension/src/merge.ts extension/src/merge.test.ts
git commit -m "feat(extension): sync-envelope merge (last-write-wins + tombstones) for v2"
```

---

## Task 8: CI guard — no CB backend calls in source

> Note for later plans: the Plan 4 kill-switch may `fetch` **only our own config host** — never `collegeboard.org`. This guard already fails the build on any `fetch`/`XMLHttpRequest` to `collegeboard.org` and on any `qbank-api` reference, so that rule is machine-enforced from here on.

**Files:**
- Create: `extension/tests/guard-ci.test.ts`

- [ ] **Step 1: Write the test `extension/tests/guard-ci.test.ts`**

```ts
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return tsFiles(p);
    return p.endsWith('.ts') ? [p] : [];
  });
}

const FORBIDDEN_TOKEN = /qbank-api/i;                                   // CB's private backend — never referenced
const FETCH_TO_CB = /(?:fetch|XMLHttpRequest|axios)[^\n;]*collegeboard\.org/i; // never call CB endpoints

describe('legal CI guard', () => {
  const files = tsFiles(SRC);
  it('scans at least the core source files', () => { expect(files.length).toBeGreaterThan(5); });

  for (const file of files) {
    it(`${file.replace(SRC, 'src')}: no qbank-api / no fetch to collegeboard.org`, () => {
      const code = readFileSync(file, 'utf8');
      expect(code, 'must not reference qbank-api').not.toMatch(FORBIDDEN_TOKEN);
      expect(code, 'must not issue network calls to collegeboard.org').not.toMatch(FETCH_TO_CB);
    });
  }
});
```

- [ ] **Step 2: Run it; verify it passes on the clean tree**

Run: `cd extension && npx vitest run tests/guard-ci.test.ts`
Expected: PASS (every src file clean).

- [ ] **Step 3: Prove the guard actually fails on a violation (temporary)**

Temporarily create `extension/src/__violation_probe.ts` with:
```ts
export const oops = () => fetch('https://qbank-api.collegeboard.org/x');
```
Run: `cd extension && npx vitest run tests/guard-ci.test.ts`
Expected: FAIL on `src/__violation_probe.ts` (both patterns match). Then **delete the probe file**:
```bash
rm extension/src/__violation_probe.ts
```
Re-run; expected: PASS again.

- [ ] **Step 4: Commit**

```bash
git add extension/tests/guard-ci.test.ts
git commit -m "test(extension): CI guard fails build on qbank-api / CB network calls in source"
```

---

## Task 9: Synthetic CB-DOM fixtures + the DOM reader

> **Synthetic only.** These fixtures mimic CB's *structure* (class names, label patterns observed on 2026-06-14: `Question ID:`, `.answer-choices`, `Correct Answer: X`) with **fabricated** question text. Never paste real CB question content into the repo.

**Files:**
- Create: `extension/src/cb/__fixtures__/multiple-choice.html`, `extension/src/cb/__fixtures__/grid-in.html`, `extension/src/cb/reader.ts`, `extension/src/cb/reader.test.ts`

- [ ] **Step 1: Create the synthetic fixtures**

`extension/src/cb/__fixtures__/multiple-choice.html`:
```html
<div role="dialog" class="qbank-preview">
  <div class="preview-header">Question ID: ab12cd34</div>
  <table class="meta">
    <tr><th>Assessment</th><th>Section</th><th>Domain</th><th>Skill</th><th>Difficulty</th></tr>
    <tr><td>SAT</td><td>Math</td><td>Algebra</td><td>Linear equations in one variable</td><td>Hard</td></tr>
  </table>
  <div class="question-stem">If 3x + 7 = 22, what is the value of x? [SYNTHETIC]</div>
  <ul class="answer-choices">
    <li class="choice"><span class="letter">A</span> 3</li>
    <li class="choice"><span class="letter">B</span> 5</li>
    <li class="choice"><span class="letter">C</span> 7</li>
    <li class="choice"><span class="letter">D</span> 15</li>
  </ul>
  <div class="rationale-block">
    <div class="correct-answer">Correct Answer: B</div>
    <div class="rationale">Subtract 7, then divide by 3. [SYNTHETIC]</div>
  </div>
</div>
```

`extension/src/cb/__fixtures__/grid-in.html`:
```html
<div role="dialog" class="qbank-preview">
  <div class="preview-header">Question ID: ef56ab78</div>
  <table class="meta">
    <tr><th>Assessment</th><th>Section</th><th>Domain</th><th>Skill</th><th>Difficulty</th></tr>
    <tr><td>SAT</td><td>Math</td><td>Algebra</td><td>Linear equations in two variables</td><td>Medium</td></tr>
  </table>
  <div class="question-stem">What value of s gives infinitely many solutions? [SYNTHETIC]</div>
  <div class="rationale-block">
    <div class="correct-answer">Correct Answer: 5</div>
    <div class="rationale">Match coefficients. [SYNTHETIC]</div>
  </div>
</div>
```

- [ ] **Step 2: Write the failing test `extension/src/cb/reader.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readQuestion } from './reader';

const here = dirname(fileURLToPath(import.meta.url));
const load = (name: string) => {
  document.body.innerHTML = readFileSync(join(here, '__fixtures__', name), 'utf8');
  return document.querySelector('[role="dialog"]')!;
};

describe('readQuestion', () => {
  it('reads a multiple-choice question', () => {
    const v = readQuestion(load('multiple-choice.html'))!;
    expect(v.id).toBe('ab12cd34');
    expect(v.section).toBe('Math');
    expect(v.domain).toBe('Algebra');
    expect(v.skill).toBe('Linear equations in one variable');
    expect(v.difficulty).toBe('Hard');
    expect(v.choices.map((c) => c.letter)).toEqual(['A', 'B', 'C', 'D']);
    expect(v.correctAnswer).toBe('B');
  });

  it('reads a grid-in question (no choices, numeric answer)', () => {
    const v = readQuestion(load('grid-in.html'))!;
    expect(v.id).toBe('ef56ab78');
    expect(v.choices).toHaveLength(0);
    expect(v.correctAnswer).toBe('5');
  });

  it('returns null when there is no Question ID present', () => {
    document.body.innerHTML = '<div role="dialog">loading…</div>';
    expect(readQuestion(document.querySelector('[role="dialog"]')!)).toBeNull();
  });

  it('captures a multi-value grid-in correct answer verbatim (scoring parses the forms)', () => {
    document.body.innerHTML =
      '<div role="dialog"><div>Question ID: aa11bb22</div><div class="correct-answer">Correct Answer: 1/3, .333, .3333</div></div>';
    expect(readQuestion(document.querySelector('[role="dialog"]')!)!.correctAnswer).toBe('1/3, .333, .3333');
  });
});
```

- [ ] **Step 3: Run it; verify it fails**

Run: `cd extension && npx vitest run src/cb/reader.test.ts`
Expected: FAIL — `./reader` not found.

- [ ] **Step 4: Create `extension/src/cb/reader.ts`**

```ts
// ISOLATED CB-DOM KNOWLEDGE. The only place (with observer.ts) that knows CB's HTML shape.
// Pure read: returns a clean view-model. Question text is for in-RAM spotlighting only — never stored.
export interface Choice { letter: string; text: string; }
export interface QuestionView {
  id: string;
  section: string; domain: string; skill: string; difficulty: string;
  stem: string;                        // RAM-only (spotlight); never persisted
  choices: Choice[];
  correctAnswer: string | null;        // present once CB renders the answer/rationale
  explanation: string | null;          // RAM-only; never persisted
}

const ID_RE = /Question ID:\s*([0-9a-f]{6,})/i;
const ANS_RE = /Correct Answer:\s*([^\n]+)/i;   // capture the FULL answer string (may list multiple acceptable forms)

export function readQuestion(root: Element): QuestionView | null {
  const text = (sel: string) => root.querySelector(sel)?.textContent?.trim() ?? '';
  const idMatch = (root.textContent ?? '').match(ID_RE);
  if (!idMatch) return null;

  const metaCells = root.querySelectorAll('table.meta tr:nth-child(2) td');
  const cell = (i: number) => metaCells[i]?.textContent?.trim() ?? '';

  const choices: Choice[] = [...root.querySelectorAll('.answer-choices .choice')].map((li) => ({
    letter: li.querySelector('.letter')?.textContent?.trim() ?? '',
    text: (li.textContent ?? '').replace(/^\s*[A-D]\s*/, '').trim(),
  }));

  const ansMatch = (text('.correct-answer') || (root.textContent ?? '')).match(ANS_RE);

  return {
    id: idMatch[1]!,
    section: cell(1), domain: cell(2), skill: cell(3), difficulty: cell(4),
    stem: text('.question-stem'),
    choices,
    correctAnswer: ansMatch ? ansMatch[1]!.trim() : null,   // raw string; scoring.ts parses multiple forms
    explanation: text('.rationale') || null,
  };
}
```

- [ ] **Step 5: Run it; verify it passes**

Run: `cd extension && npx vitest run src/cb/reader.test.ts`
Expected: PASS (3 passed).

- [ ] **Step 6: Commit**

```bash
git add extension/src/cb/reader.ts extension/src/cb/reader.test.ts extension/src/cb/__fixtures__/
git commit -m "feat(extension): CB-DOM reader + synthetic fixtures (MC + grid-in)"
```

---

## Task 10: Page observer

**Files:**
- Create: `extension/src/cb/observer.ts`, `extension/src/cb/observer.test.ts`

- [ ] **Step 1: Write the failing test `extension/src/cb/observer.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { observeQuestions } from './observer';

const here = dirname(fileURLToPath(import.meta.url));
const mc = readFileSync(join(here, '__fixtures__', 'multiple-choice.html'), 'utf8');

describe('observeQuestions', () => {
  it('fires onShown once when a question modal appears on the results page', async () => {
    history.replaceState({}, '', '/digital/results');
    document.body.innerHTML = '';
    const onShown = vi.fn();
    const stop = observeQuestions(document, onShown);

    document.body.innerHTML = mc;                 // simulate CB rendering the modal
    await vi.waitFor(() => expect(onShown).toHaveBeenCalledTimes(1));
    expect(onShown.mock.calls[0]![0].id).toBe('ab12cd34');

    stop();
  });

  it('does not fire when not on the results page', async () => {
    history.replaceState({}, '', '/digital/search');
    document.body.innerHTML = '';
    const onShown = vi.fn();
    const stop = observeQuestions(document, onShown);
    document.body.innerHTML = mc;
    await new Promise((r) => setTimeout(r, 50));
    expect(onShown).not.toHaveBeenCalled();
    stop();
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `cd extension && npx vitest run src/cb/observer.test.ts`
Expected: FAIL — `./observer` not found.

- [ ] **Step 3: Create `extension/src/cb/observer.ts`**

```ts
import { readQuestion, type QuestionView } from './reader';

// Watches the results page for a rendered question modal and emits each distinct question once.
export function observeQuestions(doc: Document, onShown: (view: QuestionView) => void): () => void {
  let lastId: string | null = null;

  const check = () => {
    if (!doc.location.pathname.includes('/digital/results')) return;
    const modal = doc.querySelector('[role="dialog"]');
    if (!modal) { lastId = null; return; }
    const view = readQuestion(modal);
    if (view && view.id !== lastId) { lastId = view.id; onShown(view); }
  };

  const obs = new MutationObserver(check);
  obs.observe(doc.body, { childList: true, subtree: true });
  check(); // catch an already-present modal
  return () => obs.disconnect();
}
```

- [ ] **Step 4: Run it; verify it passes**

Run: `cd extension && npx vitest run src/cb/observer.test.ts`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add extension/src/cb/observer.ts extension/src/cb/observer.test.ts
git commit -m "feat(extension): MutationObserver that emits each question once on results page"
```

---

## Task 11: Minimal entrypoints + buildable extension (proof of life)

**Files:**
- Create: `extension/src/entrypoints/background.ts`, `extension/src/entrypoints/content.ts`

- [ ] **Step 1: Create `extension/src/entrypoints/background.ts`**

```ts
// Minimal service worker for Plan 1. Real kill-switch/config arrives in Plan 4.
chrome.runtime.onInstalled.addListener(() => {
  console.log('[focused-practice] installed');
});
```

- [ ] **Step 2: Create `extension/src/entrypoints/content.ts`**

```ts
import { observeQuestions } from '../cb/observer';

// Plan 1 proof-of-life: detect questions on CB's results page and log only their IDs/skill.
// NOTHING is stored and NO question text is logged — this is the live-spike harness.
observeQuestions(document, (view) => {
  console.log('[focused-practice] question detected:', view.id, '·', view.skill, '·', view.difficulty,
    '· choices:', view.choices.length, '· answerReadable:', view.correctAnswer !== null);
});
```

- [ ] **Step 3: Build the extension**

Run: `cd extension && npm run build`
Expected: `Built extension to dist/` with `dist/background.js`, `dist/content.js`, `dist/manifest.json`.

- [ ] **Step 4: Typecheck + full test suite green**

Run: `cd extension && npm run typecheck && npm test`
Expected: typecheck clean; all tests PASS (smoke, model, guard, store, scoring, stats, merge, reader, observer, guard-ci).

- [ ] **Step 5: Commit**

```bash
git add extension/src/entrypoints/background.ts extension/src/entrypoints/content.ts
git commit -m "feat(extension): minimal MV3 entrypoints; buildable proof-of-life content script"
```

---

## Task 12: Live DOM-contract spike (manual — the build-sequence step 1 gate)

> No code. This validates the reader/observer against the **real** site before any UI is built. If the answer key isn't reliably in the rendered DOM on some surface, that breaks the scoring assumption — we must learn it here.

**Do NOT log in to College Board for this** (maker-assent trap). Use the public, no-login Educator bank.

- [ ] **Step 1: Load the unpacked extension**

Chrome → `chrome://extensions` → enable Developer mode → "Load unpacked" → select `extension/dist`.

- [ ] **Step 2: Exercise the real site (you drive the filters)**

Open `https://satsuiteeducatorquestionbank.collegeboard.org/digital/search`. Filter **SAT → Math → Algebra**, Search. Open the DevTools console.

- [ ] **Step 3: Verify detection across question types**

Open several questions: at least 3 multiple-choice and 2 grid-in (student-produced response). For each, confirm a console line `question detected: <id> · <skill> · <difficulty> · choices: N · answerReadable: <bool>` appears, and reveal "Show correct answer and explanation" then confirm `answerReadable` becomes `true` (re-open or observe the update).

**Grid-in answer format (trust-critical — calibrates scoring):** for each grid-in, in DevTools read the exact text CB renders after "Correct Answer:". Record whether it is a single value, a comma/"or"-separated list of acceptable forms (e.g. `1/3, .333, .3333`), or a range. If a real format isn't handled by `scoring.ts` (`splitAnswers`/`numericAccept`), add a scoring test reproducing it and extend the parser — or confirm it falls to the `{ graded:false }` indeterminate path (which is acceptable: the loop shows CB's answer with no verdict rather than risk a wrong one).

- [ ] **Step 4: Record results in the spec**

Append a short "Live DOM-contract spike — <date>" note to `docs/superpowers/specs/2026-06-15-sat-practice-overlay-design.md` (§12 step 1) recording: which question types passed, any selector mismatches found, and whether the correct answer is present in the DOM before vs. only after the reveal.

**Acceptance:** the reader extracts `id`, taxonomy, choices (MC), and `correctAnswer` (after reveal) for both multiple-choice and grid-in on the live site. **If selectors don't match reality**, fix `reader.ts` and update the synthetic fixtures to match the real structure (keeping text fabricated), re-run `npx vitest run src/cb`, and commit:
```bash
git add extension/src/cb/
git commit -m "fix(extension): align CB-DOM reader/fixtures with live structure (spike)"
```

- [ ] **Step 5: Commit the spike note**

```bash
git add docs/superpowers/specs/2026-06-15-sat-practice-overlay-design.md
git commit -m "docs: record live DOM-contract spike results"
```

---

## Self-review (completed during planning)

**Spec coverage (Plan 1 portion):** data model §6 → Tasks 2,4,7; legal guard / "only IDs + own data" §10 → Tasks 3,4,8; scoring §5/§9 → Task 5; stats/weak-areas §6 → Task 6; sync-merge §9 → Task 7; CI guard §9 → Task 8; isolated CB reader/observer §5 → Tasks 9,10; DOM-contract spike §12.1 → Task 12; synthetic-fixtures-only §9 → Task 9. **Deferred to later plans (noted):** overlay UI/focus card/randomize/calculator (Plan 2); journal panel/badger/resume UI (Plan 3); kill-switch/403-detection/cross-browser packaging/privacy (Plan 4). The `saveSession/getSession` store methods + `Session` type land here so Plan 3's resume has its substrate.

**Placeholder scan:** none — every step has concrete code/commands. Task 12 is intentionally a manual gate with explicit acceptance criteria, not a placeholder.

**Type consistency:** `QuestionView` (reader.ts) is consumed by observer.ts and content.ts with matching fields; `Attempt/Note/Session/Envelope` defined in types.ts are used consistently by model.ts, store.ts, stats.ts, merge.ts; `score(pick, correctAnswerRaw)` returns `{ graded, correct }` (the loop must branch on `graded` — `false` shows CB's answer with no verdict) and matches its test; store method names (`recordAttempt/saveNote/getNotes/saveSession/getSession/getAttempts`) are consistent across store.ts and its test.
