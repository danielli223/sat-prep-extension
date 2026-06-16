# SAT Practice Overlay — Plan 3: Journal · Progress · Badger · Resume Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the journal/progress surface — derived selectors over the existing store, a synthetic-fixture-tested CB results-list reader, a journal panel (stats + worst-first weak-area bars + mistakes list with coachmark links that drop a badger-driven highlight), a re-surface badger that injects ✓/⚠/new chips into CB's list, and guided session resume (read `getSession`, rebuild order, scroll to `lastQuestionId`) — then **augment** Plan 2's already-wired content script (badger + panel toggle + resume wiring; never rewriting Plan 2's scored loop) and add the toolbar popup.

**Architecture:** A Manifest V3 browser extension built on the Plan 1 core. This plan adds **no new store methods**: `journal.ts` derives everything from the frozen `getAttempts`/`getNotes` + `deriveStats`. All fragile "what CB's results list looks like" knowledge is isolated in `src/cb/list-reader.ts` (a sibling of `reader.ts`/`observer.ts`), tested only against **synthetic** fixtures. The UI (`panel.ts`, `badger.ts`, `resume.ts`, `coachmark.ts`) renders into the **one** shared Shadow-DOM host from Plan 2 (`mountHost`); every `innerHTML` is routed through Plan 2's exported **`html()` helper** from `host.ts` (which owns the single `focused-practice` TrustedTypes policy). **Plan 3 never calls `trustedTypes.createPolicy` itself** — a second `createPolicy` with the same name throws "policy already exists" in real Trusted-Types browsers, so the named policy is created exactly once, in `host.ts`. Guided resume reads `getSession(db, filterContext)` (contract §2.3), reconstructs a randomized order purely from the persisted `shuffleSeed` via Plan 2's `shuffleIds`, and scrolls to `lastQuestionId`. The "Practice [skill] on CB" / "Find on CB" coachmark links open CB's QB *and* drop a coachmark that, on confirmation, re-runs the badger so the relevant questions are highlighted (spec §7 hand-off).

**Tech Stack:** TypeScript · esbuild (bundling) · Vitest + happy-dom (tests) · fake-indexeddb (store-backed tests) · idb (IndexedDB wrapper). Code lives under `extension/`.

**Spec:** `docs/superpowers/specs/2026-06-15-sat-practice-overlay-design.md`
**Contract:** `docs/superpowers/plans/2026-06-15-plans-2-4-interface-contract.md`

**This is Plan 3 of 4** (per the spec's build sequence §12):
1. Foundation & DOM-contract (shipped)
2. The scored loop — Shadow-DOM overlay, focus card, randomize, calculator — **creates `src/ui/host.ts` (`mountHost`, `HOST_ID`, `TT_POLICY`, and the `html()` TrustedHTML helper), `src/order.ts` (`shuffleIds`, `newSeed`), and `src/entrypoints/content.ts`+`content.test.ts` (the scored loop `runLoop`)** — all of which this plan reuses/augments (never rewrites)
3. **Journal, progress, re-surface badger, guided resume + toolbar popup** ← this plan
4. Resilience (kill-switch, 403 detection, DOM-contract self-check) + packaging + privacy

**Cross-boundary symbols this plan REUSES (contract §1–§2 — never redefine):**
- `mountHost(doc): ShadowRoot`, `HOST_ID`, `TT_POLICY`, and the **`html(s): unknown` TrustedHTML helper** — from `src/ui/host.ts` (Plan 2 created · contract §2.1). Plan 3 imports `html()` for every `innerHTML` write and **never re-creates the `TT_POLICY` policy** (one `createPolicy('focused-practice', …)` exists, in `host.ts`).
- `runLoop(doc, db, dev): Promise<ShadowRoot>` and the start-panel `onResume` hook — from `src/entrypoints/content.ts` (Plan 2 created · this plan augments it).
- `shuffleIds(ids, seed): string[]` — from `src/order.ts` (Plan 2 created · contract §2.2).
- `getSession(db, filterContext): Promise<Session|undefined>` — from `src/store.ts` (Plan 1 frozen · contract §1, §2.3).
- `getAttempts(db)`, `getNotes(db)` — from `src/store.ts` (Plan 1 frozen · contract §1).
- `deriveStats(attempts): Stats` (+ `Stats`, `SkillStat`) — from `src/stats.ts` (Plan 1 frozen · contract §1).
- `Attempt`, `Note`, `Session` — from `src/types.ts` (Plan 1 frozen · contract §1).

**Legal invariant enforced throughout (contract §0):** only `{question IDs + the student's own data}` may persist; this plan adds **no** new store writes and **no** new persisted fields. CB's results-list text is read in RAM by the badger/list-reader and discarded — never stored. **Guardrail (spec §10):** never build or expose a comprehensive `questionID → metadata` index; taxonomy is read from per-attempt context only (the `Attempt` rows already in the store). "Practice [skill] on CB" / "Find on CB" open CB's QB via a **plain `<a href>`** (the student sets the filter — D3; we never touch CB's filter controls) **and** drop a *coachmark* that tells the student which filter to set and, on the student's confirmation, re-runs **our own badger** to highlight the matching questions in the badged list. The coachmark is our own overlay UI; the badger only adds ✓/⚠/new chips to rows already on screen — neither reads CB content nor automates CB's controls.

---

## File structure

```
extension/
  src/
    journal.ts                  # CREATE: getSeen(db), getMistakes(db) — selectors over getAttempts/getNotes + deriveStats
    journal.test.ts             # CREATE: unit tests (fake-indexeddb)
    cb/
      list-reader.ts            # CREATE: readListQuestionIds(listRoot) → {id,node}[] — isolated CB results-list DOM knowledge
      list-reader.test.ts       # CREATE: tests vs synthetic results-list fixture
      __fixtures__/
        results-list.html       # CREATE: SYNTHETIC CB results-list DOM (fabricated rows, real ID shape)
    ui/
      panel.ts                  # CREATE: renderPanel(host, vm) — stats + weak-area bars + mistakes list + coachmark links
      panel.test.ts             # CREATE: tests against an in-test ShadowRoot
      badger.ts                 # CREATE: badge(listRoot, seen) — inject ✓done/⚠missed/new chips into CB's results list
      badger.test.ts            # CREATE: tests vs synthetic results-list fixture
      resume.ts                 # CREATE: planResume(session, currentListIds), scrollToResume(listRoot, id), resumeSession(db, listRoot, filterContext) — guided resume (§2.3)
      resume.test.ts            # CREATE: unit tests (pure plan + getSession read + scroll via badger node lookup)
      coachmark.ts              # CREATE: dropCoachmark(host, {skill, onConfirm}) — points the student at CB's filter, then triggers a badger highlight
      coachmark.test.ts         # CREATE: tests against an in-test ShadowRoot
    entrypoints/
      content.ts                # MODIFY (augment Plan 2's runLoop — do NOT rewrite): add refreshBadges, mountPanelToggle, handleMessage, and resume wiring
      content.test.ts           # MODIFY (Plan 2 created it): append Plan 3 wiring tests
      popup.ts                  # CREATE: toolbar popup — "Open SAT Question Bank" link + "Open journal" message
      popup.test.ts             # CREATE: unit tests against happy-dom
  popup.html                    # CREATE: popup document (loads popup.js)
  manifest.json                 # MODIFY: action.default_popup => popup.html
  scripts/build.mjs             # MODIFY: add popup entrypoint + copy popup.html into dist/
```

**Reused files (NOT created/modified here):** `src/ui/host.ts` (its `mountHost` + the `html()` TrustedHTML helper — Plan 3 reuses `html()`, it NEVER calls `trustedTypes.createPolicy`), `src/order.ts` (Plan 2 owns), `src/store.ts`, `src/stats.ts`, `src/types.ts`, `src/model.ts` (Plan 1 owns).

**`content.ts` / `content.test.ts` are MODIFY, not CREATE:** Plan 2 already created both and wired the scored loop (`runLoop`, the start panel, `recordAttempt`/`saveNote`/`saveSession`). Plan 3 **adds** the badger, panel toggle, message handler, and the deep resume read on top of Plan 2's exports — it never replaces the file or deletes Plan 2's loop.

**Testing note:** Plan 3's UI unit tests build a bare `ShadowRoot` in-test (`document.body.attachShadow…` on a throwaway host element) and pass it where the entrypoint will later pass `mountHost(document)`. This keeps every Plan 3 unit test independent of Plan 2's `host.ts` *mount* logic while honoring its `ShadowRoot` return type. The real `mountHost` is wired only at the `content.ts` integration point (Task 6/Task 8). For TrustedHTML, production code routes every `innerHTML` write through Plan 2's exported **`html()` helper** from `host.ts` (the single owner of the `focused-practice` policy); under happy-dom `html()` falls back to the identity transform (no Trusted-Types enforcement), so the same call site works in tests without any local policy. Plan 3 **does not** define its own `setHtml`/`createPolicy` — re-creating the named policy throws in real browsers (contract §2.1: one policy, in `host.ts`).

---

## Task 1: Journal selectors — `getSeen` / `getMistakes`

`journal.ts` adds **no store methods**. It composes the frozen `getAttempts`/`getNotes` + `deriveStats` into the two read-views the panel and badger need. Covers spec D6 (mistake journal) and §6 (weak-areas derive from the existing event log).

**Files:**
- Create: `extension/src/journal.ts`, `extension/src/journal.test.ts`

- [ ] **Step 1: Write the failing test `extension/src/journal.test.ts`**

```ts
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { indexedDB } from 'fake-indexeddb';
import { openStore, recordAttempt, saveNote } from './store';
import { makeAttempt, makeNote } from './model';
import { getSeen, getMistakes } from './journal';
import type { Attempt } from './types';

async function freshDb() {
  await new Promise<void>((res) => { const r = indexedDB.deleteDatabase('sat-overlay'); r.onsuccess = () => res(); r.onerror = () => res(); });
  return openStore();
}

function att(o: Partial<Attempt> & { questionId: string; skill: string; correct: boolean; createdAt: string }): Attempt {
  return { ...makeAttempt({ deviceId: 'd', questionId: o.questionId, section: 'Math', domain: 'Algebra',
    skill: o.skill, difficulty: o.difficulty ?? 'Hard', pick: 'B', correct: o.correct }), createdAt: o.createdAt, updatedAt: o.createdAt };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-15T00:00:00.000Z')); });
afterEach(() => { vi.useRealTimers(); });

describe('getSeen', () => {
  it('returns the latest result per question as a done/missed map (delegates to deriveStats)', async () => {
    const db = await freshDb();
    await recordAttempt(db, att({ questionId: 'q1', skill: 'Inferences', correct: false, createdAt: '2026-06-10T00:00:00.000Z' }));
    await recordAttempt(db, att({ questionId: 'q1', skill: 'Inferences', correct: true,  createdAt: '2026-06-12T00:00:00.000Z' }));
    await recordAttempt(db, att({ questionId: 'q2', skill: 'Inferences', correct: false, createdAt: '2026-06-11T00:00:00.000Z' }));
    const seen = await getSeen(db);
    expect(seen).toEqual({ q1: 'done', q2: 'missed' });
  });
});

describe('getMistakes', () => {
  it('lists only currently-missed questions, joined with the latest note, newest-missed first', async () => {
    const db = await freshDb();
    await recordAttempt(db, att({ questionId: 'q1', skill: 'Inferences', correct: false, createdAt: '2026-06-10T00:00:00.000Z' }));
    await recordAttempt(db, att({ questionId: 'q2', skill: 'Linear equations', correct: false, createdAt: '2026-06-12T00:00:00.000Z' }));
    await recordAttempt(db, att({ questionId: 'q3', skill: 'Inferences', correct: true,  createdAt: '2026-06-11T00:00:00.000Z' })); // correct → excluded
    await saveNote(db, makeNote({ deviceId: 'd', questionId: 'q1', text: 'missed the trap' }));

    const mistakes = await getMistakes(db);
    expect(mistakes.map((m) => m.questionId)).toEqual(['q2', 'q1']); // q2 missed later → first
    expect(mistakes[0]!.note).toBeNull();
    expect(mistakes[0]!.skill).toBe('Linear equations');
    expect(mistakes[1]!.note).toBe('missed the trap');
    expect(mistakes[1]!.difficulty).toBe('Hard');
    expect(mistakes[1]!.lastSeenAt).toBe('2026-06-10T00:00:00.000Z');
  });

  it('flips a mistake to resolved when a later attempt is correct (latest-attempt wins)', async () => {
    const db = await freshDb();
    await recordAttempt(db, att({ questionId: 'q1', skill: 'X', correct: false, createdAt: '2026-06-10T00:00:00.000Z' }));
    await recordAttempt(db, att({ questionId: 'q1', skill: 'X', correct: true,  createdAt: '2026-06-13T00:00:00.000Z' }));
    expect(await getMistakes(db)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `cd extension && npx vitest run src/journal.test.ts`
Expected: FAIL — cannot import from `./journal` (module not found).

- [ ] **Step 3: Create `extension/src/journal.ts`**

```ts
import type { IDBPDatabase } from 'idb';
import { getAttempts, getNotes } from './store';
import { deriveStats } from './stats';
import type { Attempt } from './types';

// Read-views for the journal/badger. NO new store methods, NO new persisted fields:
// everything derives from the frozen getAttempts/getNotes + deriveStats event log.
// Taxonomy (skill/difficulty) is read from per-attempt context only — never a global
// questionId->metadata index (spec §10 guardrail).

export interface Mistake {
  questionId: string;
  skill: string;
  difficulty: string;
  lastSeenAt: string;            // createdAt of the latest (still-missed) attempt
  note: string | null;          // latest note for this question, if any
}

/** Latest result per question as a done/missed map. Thin wrapper over deriveStats.seen. */
export async function getSeen(db: IDBPDatabase): Promise<Record<string, 'done' | 'missed'>> {
  const attempts = await getAttempts(db);
  return deriveStats(attempts).seen;
}

/** Currently-missed questions (latest attempt wrong), joined with the latest note, newest-missed first. */
export async function getMistakes(db: IDBPDatabase): Promise<Mistake[]> {
  const attempts = await getAttempts(db);
  const latestNoteByQ = latestNote(await getNotes(db));

  const latest = new Map<string, Attempt>();
  for (const a of attempts) {
    if (a.deleted) continue;
    const prev = latest.get(a.questionId);
    if (!prev || a.createdAt > prev.createdAt) latest.set(a.questionId, a);
  }

  return [...latest.values()]
    .filter((a) => !a.correct)
    .sort((x, y) => (x.createdAt < y.createdAt ? 1 : x.createdAt > y.createdAt ? -1 : 0))
    .map((a) => ({
      questionId: a.questionId,
      skill: a.skill,
      difficulty: a.difficulty,
      lastSeenAt: a.createdAt,
      note: latestNoteByQ.get(a.questionId) ?? null,
    }));
}

function latestNote(notes: { questionId: string; text: string; createdAt: string; deleted: boolean }[]): Map<string, string> {
  const byQ = new Map<string, { text: string; at: string }>();
  for (const n of notes) {
    if (n.deleted) continue;
    const prev = byQ.get(n.questionId);
    if (!prev || n.createdAt > prev.at) byQ.set(n.questionId, { text: n.text, at: n.createdAt });
  }
  return new Map([...byQ.entries()].map(([q, v]) => [q, v.text]));
}
```

- [ ] **Step 4: Run it; verify it passes**

Run: `cd extension && npx vitest run src/journal.test.ts`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add extension/src/journal.ts extension/src/journal.test.ts
git commit -m "feat(extension): journal selectors getSeen/getMistakes over the event log (no new store methods)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: CB results-list reader — `readListQuestionIds`

Isolated CB-DOM knowledge, a sibling of `reader.ts`/`observer.ts`: pull each results-row's question ID + its row node, so the badger can attach chips without itself knowing CB's HTML. Tested only against a **synthetic** fixture (fabricated rows, real ID shape). Covers spec §5 component #7 (badger depends on isolated CB-list DOM).

**Files:**
- Create: `extension/src/cb/__fixtures__/results-list.html`, `extension/src/cb/list-reader.ts`, `extension/src/cb/list-reader.test.ts`

- [ ] **Step 1: Create the synthetic fixture `extension/src/cb/__fixtures__/results-list.html`**

> **Synthetic only.** Mimics CB's results-list *structure* (a table of rows, each with a `Question ID:` cell) with **fabricated** text. Never paste real CB question content into the repo (contract §0).

```html
<div class="results-page">
  <table class="question-bank-results">
    <thead>
      <tr><th>Question ID</th><th>Skill</th><th>Difficulty</th></tr>
    </thead>
    <tbody>
      <tr class="result-row"><td class="qid">Question ID: ab12cd34</td><td>Linear equations [SYNTHETIC]</td><td>Hard</td></tr>
      <tr class="result-row"><td class="qid">Question ID: ef56ab78</td><td>Inferences [SYNTHETIC]</td><td>Medium</td></tr>
      <tr class="result-row"><td class="qid">Question ID: 99ff00aa</td><td>Geometry [SYNTHETIC]</td><td>Easy</td></tr>
      <tr class="result-row no-id"><td class="qid">loading…</td><td></td><td></td></tr>
    </tbody>
  </table>
</div>
```

- [ ] **Step 2: Write the failing test `extension/src/cb/list-reader.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readListQuestionIds } from './list-reader';

const here = dirname(fileURLToPath(import.meta.url));
function loadList(): Element {
  document.body.innerHTML = readFileSync(join(here, '__fixtures__', 'results-list.html'), 'utf8');
  return document.querySelector('.results-page')!;
}

describe('readListQuestionIds', () => {
  it('extracts {id,node} for every row that carries a Question ID, in document order', () => {
    const rows = readListQuestionIds(loadList());
    expect(rows.map((r) => r.id)).toEqual(['ab12cd34', 'ef56ab78', '99ff00aa']);
    expect(rows[0]!.node).toBeInstanceOf(Element);
    expect(rows[0]!.node.classList.contains('result-row')).toBe(true);
  });

  it('skips rows with no Question ID (e.g. a loading row)', () => {
    const rows = readListQuestionIds(loadList());
    expect(rows.some((r) => r.node.classList.contains('no-id'))).toBe(false);
  });

  it('returns [] when the root has no result rows', () => {
    document.body.innerHTML = '<div class="results-page"><p>No results.</p></div>';
    expect(readListQuestionIds(document.querySelector('.results-page')!)).toEqual([]);
  });
});
```

- [ ] **Step 3: Run it; verify it fails**

Run: `cd extension && npx vitest run src/cb/list-reader.test.ts`
Expected: FAIL — cannot import from `./list-reader`.

- [ ] **Step 4: Create `extension/src/cb/list-reader.ts`**

```ts
// ISOLATED CB-DOM KNOWLEDGE (sibling of reader.ts/observer.ts). The only place that knows the
// shape of CB's *results list*. Pure read: returns each row's question ID + its row node so the
// badger can attach chips without itself touching CB's HTML. No content is read or returned —
// only IDs + the node to anchor a chip on.
export interface ListRow { id: string; node: Element; }

const ROW_ID_RE = /Question ID:\s*([0-9a-f]{6,})/i;

export function readListQuestionIds(listRoot: Element): ListRow[] {
  const rows: ListRow[] = [];
  for (const node of listRoot.querySelectorAll('.result-row')) {
    const m = (node.textContent ?? '').match(ROW_ID_RE);
    if (m) rows.push({ id: m[1]!, node });
  }
  return rows;
}
```

- [ ] **Step 5: Run it; verify it passes**

Run: `cd extension && npx vitest run src/cb/list-reader.test.ts`
Expected: PASS (3 passed).

- [ ] **Step 6: Commit**

```bash
git add extension/src/cb/list-reader.ts extension/src/cb/list-reader.test.ts extension/src/cb/__fixtures__/results-list.html
git commit -m "feat(extension): isolated CB results-list reader + synthetic fixture

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Re-surface badger — `badge(listRoot, seen)`

Inject `✓ done` / `⚠ missed` / `new` chips into CB's results list, matching on-screen IDs against the `seen` map. Uses `readListQuestionIds` for the row→node mapping; idempotent (re-running replaces chips, never duplicates). Covers spec D6 (badges previously-seen questions), §7 (badged list `✓ done / ⚠ missed / new`).

**Files:**
- Create: `extension/src/ui/badger.ts`, `extension/src/ui/badger.test.ts`

- [ ] **Step 1: Write the failing test `extension/src/ui/badger.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { badge, BADGE_CLASS } from './badger';

const here = dirname(fileURLToPath(import.meta.url));
function loadList(): Element {
  document.body.innerHTML = readFileSync(join(here, '..', 'cb', '__fixtures__', 'results-list.html'), 'utf8');
  return document.querySelector('.results-page')!;
}

describe('badge', () => {
  it('injects a done/missed/new chip per row keyed off the seen map', () => {
    const root = loadList();
    badge(root, { ab12cd34: 'done', ef56ab78: 'missed' }); // 99ff00aa absent → "new"
    const chips = [...root.querySelectorAll(`.${BADGE_CLASS}`)];
    expect(chips).toHaveLength(3);
    expect(chips[0]!.getAttribute('data-state')).toBe('done');
    expect(chips[0]!.textContent).toContain('done');
    expect(chips[1]!.getAttribute('data-state')).toBe('missed');
    expect(chips[1]!.textContent).toContain('missed');
    expect(chips[2]!.getAttribute('data-state')).toBe('new');
    expect(chips[2]!.textContent).toContain('new');
  });

  it('is idempotent: re-running with new data replaces chips, never duplicates them', () => {
    const root = loadList();
    badge(root, { ab12cd34: 'missed' });
    badge(root, { ab12cd34: 'done' });
    const chips = [...root.querySelectorAll(`.${BADGE_CLASS}`)];
    expect(chips).toHaveLength(3);                                   // one per row, not six
    expect(chips[0]!.getAttribute('data-state')).toBe('done');       // reflects the latest call
  });

  it('does not store or echo any CB question text — chips carry only state labels', () => {
    const root = loadList();
    badge(root, { ab12cd34: 'done' });
    for (const chip of root.querySelectorAll(`.${BADGE_CLASS}`)) {
      expect(chip.textContent).toMatch(/^(✓ done|⚠ missed|new)$/);
    }
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `cd extension && npx vitest run src/ui/badger.test.ts`
Expected: FAIL — cannot import from `./badger`.

- [ ] **Step 3: Create `extension/src/ui/badger.ts`**

```ts
import { readListQuestionIds } from '../cb/list-reader';

// Re-surface badger (spec §7). Matches on-screen result IDs against the seen map and injects a
// state chip into each row. We create plain text-node chips (no innerHTML, no CB content echoed):
// the chip's only text is one of three fixed state labels. Idempotent — a prior chip on a row is
// removed before the new one is added, so repeated badge() calls never duplicate.
export const BADGE_CLASS = 'fp-badge';

type State = 'done' | 'missed' | 'new';
const LABEL: Record<State, string> = { done: '✓ done', missed: '⚠ missed', new: 'new' };

export function badge(listRoot: Element, seen: Record<string, 'done' | 'missed'>): void {
  for (const { id, node } of readListQuestionIds(listRoot)) {
    node.querySelector(`.${BADGE_CLASS}`)?.remove();
    const state: State = seen[id] ?? 'new';
    const chip = node.ownerDocument.createElement('span');
    chip.className = BADGE_CLASS;
    chip.setAttribute('data-state', state);
    chip.textContent = LABEL[state];   // textContent, never innerHTML — no CB text can leak in
    node.appendChild(chip);
  }
}
```

- [ ] **Step 4: Run it; verify it passes**

Run: `cd extension && npx vitest run src/ui/badger.test.ts`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add extension/src/ui/badger.ts extension/src/ui/badger.test.ts
git commit -m "feat(extension): re-surface badger injecting done/missed/new chips into CB's list

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Guided resume — `planResume` + `scrollToResume` + `resumeSession`

Per contract §2.3: **read the session** (`getSession(db, filterContext)`), rebuild a randomized order from the persisted `shuffleSeed` via Plan 2's `shuffleIds`, and scroll to `lastQuestionId` via the badger's row→node mapping (`readListQuestionIds`). Guided (not one-click) per D9 — no per-question URLs. This task ships **all three** pieces of the resume protocol so the integration layer (Task 6/Task 8) has a single call to make:
- `planResume(session, currentListIds)` — pure order reconstruction (unit-tested without DOM);
- `scrollToResume(listRoot, id)` — DOM scroll via the synthetic results-list fixture;
- `resumeSession(db, listRoot, filterContext)` — the contract §2.3 **read protocol**: it calls `getSession`, and when a session exists, computes `planResume` over the on-screen IDs and `scrollToResume`s to `lastQuestionId`. Without this, the contract's "Plan 3 reads `getSession`" obligation is owned by no code.

**Files:**
- Create: `extension/src/ui/resume.ts`, `extension/src/ui/resume.test.ts`

- [ ] **Step 1: Write the failing test `extension/src/ui/resume.test.ts`**

```ts
import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';
import { indexedDB } from 'fake-indexeddb';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planResume, scrollToResume, resumeSession } from './resume';
import { shuffleIds } from '../order';
import { openStore, saveSession } from '../store';
import { makeSession } from '../model';
import type { Session } from '../types';

const here = dirname(fileURLToPath(import.meta.url));
function loadList(): Element {
  document.body.innerHTML = readFileSync(join(here, '..', 'cb', '__fixtures__', 'results-list.html'), 'utf8');
  return document.querySelector('.results-page')!;
}

async function freshDb() {
  await new Promise<void>((res) => { const r = indexedDB.deleteDatabase('sat-overlay'); r.onsuccess = () => res(); r.onerror = () => res(); });
  return openStore();
}

function session(o: Partial<Session>): Session {
  return { sessionId: 's', filterContext: 'SAT|Math|Algebra|Hard', orderMode: 'list', shuffleSeed: 0,
    lastQuestionId: null, userId: null, deviceId: 'd', createdAt: 't', updatedAt: 't',
    deleted: false, dirty: false, schemaVersion: 1, ...o };
}

describe('planResume', () => {
  it('list mode: keeps CB list order and reports the resume index', () => {
    const plan = planResume(session({ orderMode: 'list', lastQuestionId: 'ef56ab78' }), ['ab12cd34', 'ef56ab78', '99ff00aa']);
    expect(plan.order).toEqual(['ab12cd34', 'ef56ab78', '99ff00aa']);
    expect(plan.resumeId).toBe('ef56ab78');
    expect(plan.resumeIndex).toBe(1);
  });

  it('random mode: rebuilds order from shuffleSeed via shuffleIds (contract §2.3)', () => {
    const ids = ['ab12cd34', 'ef56ab78', '99ff00aa'];
    const plan = planResume(session({ orderMode: 'random', shuffleSeed: 7, lastQuestionId: ids[2] }), ids);
    expect(plan.order).toEqual(shuffleIds(ids, 7));                 // reconstructed deterministically
    expect(plan.resumeIndex).toBe(plan.order.indexOf(ids[2]!));     // index within the rebuilt order
  });

  it('reports resumeIndex -1 when lastQuestionId is no longer in the loaded results', () => {
    const plan = planResume(session({ orderMode: 'list', lastQuestionId: 'gone' }), ['ab12cd34', 'ef56ab78']);
    expect(plan.resumeIndex).toBe(-1);
  });
});

describe('scrollToResume', () => {
  it('scrolls the row whose Question ID matches and returns it', () => {
    const root = loadList();
    const target = root.querySelector('.result-row')!; // ab12cd34 row
    const spy = vi.spyOn(target, 'scrollIntoView').mockImplementation(() => {});
    const node = scrollToResume(root, 'ab12cd34');
    expect(node).toBe(target);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('returns null when the target id is not present in the list', () => {
    const root = loadList();
    expect(scrollToResume(root, 'not-loaded')).toBeNull();
  });
});

describe('resumeSession (contract §2.3 read protocol)', () => {
  it('reads getSession, rebuilds the order, and scrolls to lastQuestionId', async () => {
    const db = await freshDb();
    const s = makeSession({ deviceId: 'd', filterContext: 'SAT|Math|Algebra|Hard', orderMode: 'random', shuffleSeed: 7 });
    s.lastQuestionId = 'ef56ab78';
    await saveSession(db, s);

    const root = loadList();
    const target = root.querySelector('.result-row:nth-child(2)') as Element; // ef56ab78 row
    const spy = vi.spyOn(target, 'scrollIntoView').mockImplementation(() => {});

    const result = await resumeSession(db, root, 'SAT|Math|Algebra|Hard');
    expect(result).not.toBeNull();
    expect(result!.plan.order).toEqual(shuffleIds(['ab12cd34', 'ef56ab78', '99ff00aa'], 7)); // rebuilt from seed
    expect(result!.scrolledTo).toBe(target);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('returns null when there is no saved session for the filter (nothing to resume)', async () => {
    const db = await freshDb();
    expect(await resumeSession(db, loadList(), 'SAT|Math|Algebra|Hard')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `cd extension && npx vitest run src/ui/resume.test.ts`
Expected: FAIL — cannot import from `./resume` (and `../order` resolves once Plan 2 is in place; this plan executes after Plan 2).

- [ ] **Step 3: Create `extension/src/ui/resume.ts`**

```ts
import type { IDBPDatabase } from 'idb';
import { shuffleIds } from '../order';
import { getSession } from '../store';
import { readListQuestionIds } from '../cb/list-reader';
import type { Session } from '../types';

// Guided resume (spec D9, contract §2.3). We never auto-advance or fetch — we reconstruct the
// session's question ORDER (deterministically, from the persisted shuffleSeed) and point the
// student back to where they were by scrolling that row into view via the badger's node lookup.
export interface ResumePlan {
  order: string[];        // the session's order over the currently-loaded results
  resumeId: string | null;
  resumeIndex: number;    // index of resumeId within `order`; -1 if it's no longer loaded
}

export interface ResumeResult {
  session: Session;
  plan: ResumePlan;
  scrolledTo: Element | null;   // the row we scrolled into view, or null if lastQuestionId isn't loaded
}

export function planResume(session: Session, currentListIds: string[]): ResumePlan {
  const order = session.orderMode === 'random'
    ? shuffleIds(currentListIds, session.shuffleSeed)   // contract §2.3: rebuild from the seed
    : [...currentListIds];
  const resumeId = session.lastQuestionId;
  const resumeIndex = resumeId === null ? -1 : order.indexOf(resumeId);
  return { order, resumeId, resumeIndex };
}

/** Scroll the results row for `id` into view (guided resume). Returns the row node, or null. */
export function scrollToResume(listRoot: Element, id: string): Element | null {
  const row = readListQuestionIds(listRoot).find((r) => r.id === id);
  if (!row) return null;
  row.node.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return row.node;
}

// Contract §2.3 READ protocol — the single entry point the content script calls on Resume.
// Reads the persisted session for this filter, rebuilds its order from shuffleSeed, and scrolls to
// lastQuestionId. Returns null when there is no session to resume.
export async function resumeSession(
  db: IDBPDatabase, listRoot: Element, filterContext: string,
): Promise<ResumeResult | null> {
  const session = await getSession(db, filterContext);
  if (!session) return null;
  const ids = readListQuestionIds(listRoot).map((r) => r.id);
  const plan = planResume(session, ids);
  const scrolledTo = plan.resumeId ? scrollToResume(listRoot, plan.resumeId) : null;
  return { session, plan, scrolledTo };
}
```

- [ ] **Step 4: Run it; verify it passes**

Run: `cd extension && npx vitest run src/ui/resume.test.ts`
Expected: PASS (7 passed) — including `resumeSession` reading `getSession`, rebuilding the order, and scrolling.

- [ ] **Step 5: Commit**

```bash
git add extension/src/ui/resume.ts extension/src/ui/resume.test.ts
git commit -m "feat(extension): guided resume — read getSession, rebuild order from shuffleSeed, scroll via badger (contract §2.3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Journal/progress panel — `renderPanel`

Render the journal panel into the shared Shadow-DOM host: progress stats (done/accuracy/streak), weak-area bars worst-first with "Practice [skill] on CB", and the mistakes list (note + ID/skill/difficulty/date + "Practice skill"/"Find on CB"). **All `innerHTML` goes through Plan 2's exported `html()` helper from `host.ts`** — Plan 3 imports `html`, it **never** calls `trustedTypes.createPolicy` (the `focused-practice` policy is created exactly once, in `host.ts`; a second `createPolicy` with the same name throws "policy already exists" in real Trusted-Types browsers — contract §2.1). "Practice [skill] on CB" / "Find on CB" are `<a href=CB_SEARCH_URL>` links **and** carry a `data-skill` hook so the integration layer can attach the coachmark/badger hand-off (Task 5b); the student still sets CB's filter (D3) — we never automate CB's controls. Covers spec D6, §6 weak-areas, §7 panel.

**Files:**
- Create: `extension/src/ui/panel.ts`, `extension/src/ui/panel.test.ts`

- [ ] **Step 1: Write the failing test `extension/src/ui/panel.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { renderPanel, type PanelVM, CB_SEARCH_URL } from './panel';
import type { Stats } from '../stats';
import type { Mistake } from '../journal';

function shadow(): ShadowRoot {
  const hostEl = document.createElement('div');
  document.body.appendChild(hostEl);
  return hostEl.attachShadow({ mode: 'open' });
}

const stats: Stats = {
  total: 12, correct: 9, accuracy: 0.75,
  perSkill: [
    { skill: 'Inferences', total: 4, correct: 1, accuracy: 0.25 },
    { skill: 'Linear equations', total: 8, correct: 8, accuracy: 1 },
  ],
  seen: {}, streakDays: 3,
};
const mistakes: Mistake[] = [
  { questionId: 'ab12cd34', skill: 'Inferences', difficulty: 'Hard', lastSeenAt: '2026-06-13T00:00:00.000Z', note: 'fell for the trap' },
];
const vm: PanelVM = { stats, mistakes };

describe('renderPanel', () => {
  it('shows done/accuracy/streak stats', () => {
    const root = shadow();
    renderPanel(root, vm);
    const text = root.textContent ?? '';
    expect(text).toContain('12');     // done (total)
    expect(text).toContain('75%');    // accuracy
    expect(text).toContain('3');      // streak days
  });

  it('renders weak-area bars worst-first, each with a Practice-on-CB coachmark link carrying a data-skill hook', () => {
    const root = shadow();
    renderPanel(root, vm);
    const bars = [...root.querySelectorAll('.fp-weak-area')];
    expect(bars[0]!.textContent).toContain('Inferences');         // 25% worst → first
    const link = bars[0]!.querySelector('a.fp-practice-link') as HTMLAnchorElement;
    expect(link.href).toBe(CB_SEARCH_URL);                        // plain link to CB QB (student drives — D3)
    expect(link.target).toBe('_blank');
    expect(link.dataset.skill).toBe('Inferences');                // hook the integration layer wires the coachmark to
    expect(link.textContent).toContain('Practice Inferences on CB');
  });

  it('renders the mistakes list with note + id/skill/difficulty/date + Practice/Find links', () => {
    const root = shadow();
    renderPanel(root, vm);
    const item = root.querySelector('.fp-mistake')!;
    const t = item.textContent ?? '';
    expect(t).toContain('ab12cd34');
    expect(t).toContain('Inferences');
    expect(t).toContain('Hard');
    expect(t).toContain('2026-06-13');
    expect(t).toContain('fell for the trap');
    expect(item.querySelector('a.fp-practice-link')).not.toBeNull();
    expect(item.querySelector('a.fp-find-link')).not.toBeNull();
  });

  it('renders the mistake Practice/Find links with a data-skill hook for the coachmark hand-off', () => {
    const root = shadow();
    renderPanel(root, vm);
    const item = root.querySelector('.fp-mistake')!;
    expect((item.querySelector('a.fp-practice-link') as HTMLAnchorElement).dataset.skill).toBe('Inferences');
    expect((item.querySelector('a.fp-find-link') as HTMLAnchorElement).dataset.skill).toBe('Inferences');
  });

  it('escapes the student note (no HTML injection from journal text)', () => {
    const root = shadow();
    renderPanel(root, { stats, mistakes: [{ ...mistakes[0]!, note: '<img src=x onerror=alert(1)>' }] });
    expect(root.querySelector('.fp-mistake img')).toBeNull();     // note rendered as text, not markup
    expect(root.querySelector('.fp-mistake-note')!.textContent).toContain('<img');
  });

  it('shows an empty state when there are no mistakes yet', () => {
    const root = shadow();
    renderPanel(root, { stats: { ...stats, perSkill: [] }, mistakes: [] });
    expect(root.textContent).toContain('No mistakes logged yet');
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `cd extension && npx vitest run src/ui/panel.test.ts`
Expected: FAIL — cannot import from `./panel`.

- [ ] **Step 3: Create `extension/src/ui/panel.ts`**

```ts
import { html } from './host';
import type { Stats } from '../stats';
import type { Mistake } from '../journal';

// Journal/progress panel (spec §7). Renders into the shared Shadow-DOM host. EVERY innerHTML write
// goes through Plan 2's html() helper from host.ts — the SINGLE owner of the "focused-practice"
// TrustedTypes policy (contract §2.1 / spec §8.4). We do NOT call trustedTypes.createPolicy here: a
// second createPolicy with the same name throws "policy already exists" in real Trusted-Types
// browsers. "Practice [skill] on CB" / "Find on CB" are plain links to CB's QB carrying a
// data-skill hook — the student drives the filter (D3); the integration layer (Task 5b/Task 6)
// attaches the coachmark/badger hand-off. We never touch CB's controls and never auto-apply a filter.
export interface PanelVM { stats: Stats; mistakes: Mistake[]; }

// Educator Question Bank search page (a plain link — expressly permitted, spec §4 step 1).
export const CB_SEARCH_URL = 'https://satsuiteeducatorquestionbank.collegeboard.org/digital/search';

function setHtml(el: Element, markup: string): void {
  el.innerHTML = html(markup) as unknown as string;   // host.ts owns the one policy; we just route through it
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
const pct = (n: number) => `${Math.round(n * 100)}%`;
const day = (iso: string) => iso.slice(0, 10);

function weakAreaHtml(s: { skill: string; accuracy: number; total: number }): string {
  return `<div class="fp-weak-area">
    <div class="fp-weak-head"><span class="fp-skill">${esc(s.skill)}</span><span class="fp-acc">${pct(s.accuracy)} (${s.total})</span></div>
    <div class="fp-bar"><div class="fp-bar-fill" style="width:${pct(s.accuracy)}"></div></div>
    <a class="fp-practice-link" data-skill="${esc(s.skill)}" href="${CB_SEARCH_URL}" target="_blank" rel="noopener">Practice ${esc(s.skill)} on CB</a>
  </div>`;
}

function mistakeHtml(m: Mistake): string {
  const note = m.note ? `<p class="fp-mistake-note">${esc(m.note)}</p>` : '';
  return `<li class="fp-mistake">
    <div class="fp-mistake-meta"><code>${esc(m.questionId)}</code> · ${esc(m.skill)} · ${esc(m.difficulty)} · ${day(m.lastSeenAt)}</div>
    ${note}
    <div class="fp-mistake-actions">
      <a class="fp-practice-link" data-skill="${esc(m.skill)}" href="${CB_SEARCH_URL}" target="_blank" rel="noopener">Practice ${esc(m.skill)}</a>
      <a class="fp-find-link" data-skill="${esc(m.skill)}" href="${CB_SEARCH_URL}" target="_blank" rel="noopener">Find on CB</a>
    </div>
  </li>`;
}

export function renderPanel(host: ShadowRoot, vm: PanelVM): void {
  const { stats, mistakes } = vm;
  const weak = stats.perSkill.map(weakAreaHtml).join('');
  const mistakesHtml = mistakes.length
    ? `<ul class="fp-mistakes">${mistakes.map(mistakeHtml).join('')}</ul>`
    : `<p class="fp-empty">No mistakes logged yet — your missed questions will show up here.</p>`;

  let panel = host.querySelector('.fp-panel');
  if (!panel) { panel = document.createElement('section'); panel.className = 'fp-panel'; host.appendChild(panel); }
  setHtml(panel, `
    <header class="fp-panel-head"><h2>Your progress</h2></header>
    <div class="fp-stats">
      <div class="fp-stat"><span class="fp-stat-n">${stats.total}</span><span class="fp-stat-l">done</span></div>
      <div class="fp-stat"><span class="fp-stat-n">${pct(stats.accuracy)}</span><span class="fp-stat-l">accuracy</span></div>
      <div class="fp-stat"><span class="fp-stat-n">${stats.streakDays}</span><span class="fp-stat-l">day streak</span></div>
    </div>
    <h3>Weak areas (worst first)</h3>
    <div class="fp-weak-areas">${weak || '<p class="fp-empty">Answer a few questions to see your weak areas.</p>'}</div>
    <h3>Mistakes</h3>
    ${mistakesHtml}`);
}
```

> **Reuse, don't re-create, the policy.** `setHtml` here is a one-line wrapper around `host.ts`'s exported `html()` — it does NOT call `trustedTypes.createPolicy`. The `focused-practice` policy is created exactly once, inside `mountHost`/`html()` (contract §2.1). Under happy-dom `html()` is the identity transform, so this works in the in-test `ShadowRoot` (Step 1) without any Trusted-Types setup. In a real browser the named policy already exists from Plan 2's host; a second `createPolicy('focused-practice', …)` would throw "policy already exists".

- [ ] **Step 4: Run it; verify it passes**

Run: `cd extension && npx vitest run src/ui/panel.test.ts`
Expected: PASS (7 passed).

- [ ] **Step 5: Commit**

```bash
git add extension/src/ui/panel.ts extension/src/ui/panel.test.ts
git commit -m "feat(extension): journal/progress panel (stats, worst-first weak areas, mistakes, coachmark links) routed through host html()

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5b: Coachmark hand-off — `dropCoachmark` (spec §7 Practice/Find → highlight)

Spec §7/§4 requires "Practice [skill] on CB" / "Find on CB" to do more than open a link: after the student opens CB's QB and sets the filter, the extension should **drop a coachmark** that tells them which filter to set and then **re-run our own badger** so the matching questions are highlighted in the badged list. Task 5 already emits the link with a `data-skill` hook; this task adds the coachmark UI and the hand-off, so the panel's coachmark links are wired (not bare `<a href>`). The student still sets CB's filter (D3) — `dropCoachmark` only renders our own overlay coaching and, on the student's "Done — highlight them" confirmation, calls back to re-badge. No CB control is automated; no CB content is read.

**Files:**
- Create: `extension/src/ui/coachmark.ts`, `extension/src/ui/coachmark.test.ts`

- [ ] **Step 1: Write the failing test `extension/src/ui/coachmark.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import { dropCoachmark, COACHMARK_CLASS } from './coachmark';

function shadow(): ShadowRoot {
  const hostEl = document.createElement('div');
  document.body.appendChild(hostEl);
  return hostEl.attachShadow({ mode: 'open' });
}

describe('dropCoachmark', () => {
  it('renders a skill-specific coachmark telling the student which filter to set', () => {
    const root = shadow();
    dropCoachmark(root, { skill: 'Inferences', onConfirm: vi.fn() });
    const mark = root.querySelector(`.${COACHMARK_CLASS}`)!;
    expect(mark.textContent).toContain('Inferences');           // names the skill to filter on
    expect(mark.textContent).toContain('CB');                   // points the student at CB's filter (D3)
    expect(root.querySelector('.fp-coachmark-confirm')).not.toBeNull();
  });

  it('fires onConfirm (the badger re-highlight hand-off) when the student confirms', () => {
    const root = shadow();
    const onConfirm = vi.fn();
    dropCoachmark(root, { skill: 'Inferences', onConfirm });
    (root.querySelector('.fp-coachmark-confirm') as HTMLElement).click();
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('is idempotent: a second drop replaces the prior coachmark, never stacks two', () => {
    const root = shadow();
    dropCoachmark(root, { skill: 'A', onConfirm: vi.fn() });
    dropCoachmark(root, { skill: 'B', onConfirm: vi.fn() });
    expect(root.querySelectorAll(`.${COACHMARK_CLASS}`)).toHaveLength(1);
    expect(root.querySelector(`.${COACHMARK_CLASS}`)!.textContent).toContain('B');
  });

  it('dismiss removes the coachmark without firing onConfirm', () => {
    const root = shadow();
    const onConfirm = vi.fn();
    dropCoachmark(root, { skill: 'A', onConfirm });
    (root.querySelector('.fp-coachmark-dismiss') as HTMLElement).click();
    expect(root.querySelector(`.${COACHMARK_CLASS}`)).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `cd extension && npx vitest run src/ui/coachmark.test.ts`
Expected: FAIL — cannot import from `./coachmark`.

- [ ] **Step 3: Create `extension/src/ui/coachmark.ts`**

```ts
import { html } from './host';

// Coachmark hand-off (spec §7/§4). When the student clicks "Practice [skill] on CB" / "Find on CB",
// the integration layer opens CB's QB (a plain <a>, D3) AND drops this coachmark into the shared
// host. The coachmark names the filter to set on CB and, on the student's confirmation, fires
// onConfirm — the content script's badger re-highlight. We never automate CB's controls and never
// read CB content; this is purely OUR overlay coaching + a callback. All innerHTML routes through
// host.ts's html() (the single TrustedTypes policy owner — contract §2.1).
export const COACHMARK_CLASS = 'fp-coachmark';

export interface CoachmarkOpts { skill: string; onConfirm: () => void; }

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export function dropCoachmark(host: ShadowRoot, opts: CoachmarkOpts): void {
  host.querySelector(`.${COACHMARK_CLASS}`)?.remove();   // idempotent: never stack two
  const mark = document.createElement('aside');
  mark.className = COACHMARK_CLASS;
  mark.innerHTML = html(
    `<p class="fp-coachmark-text">On CB's Question Bank, set the <strong>${esc(opts.skill)}</strong> filter,
       then come back here.</p>
     <div class="fp-coachmark-actions">
       <button class="fp-coachmark-confirm">Done — highlight them</button>
       <button class="fp-coachmark-dismiss">Dismiss</button>
     </div>`) as unknown as string;
  host.appendChild(mark);

  mark.querySelector('.fp-coachmark-confirm')!.addEventListener('click', () => {
    opts.onConfirm();           // hand off to the badger re-highlight
    mark.remove();
  });
  mark.querySelector('.fp-coachmark-dismiss')!.addEventListener('click', () => mark.remove());
}
```

- [ ] **Step 4: Run it; verify it passes**

Run: `cd extension && npx vitest run src/ui/coachmark.test.ts`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add extension/src/ui/coachmark.ts extension/src/ui/coachmark.test.ts
git commit -m "feat(extension): coachmark hand-off for Practice/Find links (point at CB filter, then re-highlight via badger)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Augment the content script — badger + panel toggle (+ coachmark + resume wiring)

**AUGMENT Plan 2's `content.ts` — do NOT rewrite it.** Plan 2 already created `content.ts` and wired the scored loop (`runLoop`, the start panel, `recordAttempt`/`saveNote`/`saveSession`), plus its co-located `content.test.ts`. This task **adds** to both files: it appends the badger + panel-toggle + coachmark + resume wiring on top of Plan 2's exports, keeping `runLoop` and the scored loop intact. Concretely, Plan 3 adds the exports `findResultsList`, `refreshBadges`, `mountPanelToggle`, `bindPanelCoachmarks`, `resumeFor` (which wraps `resumeSession`), and replaces Plan 2's `onResume: () => start(...)` stub with one that calls `resumeFor` first (the contract §2.3 `getSession` read) and then starts the loop. It imports — and never deletes — Plan 2's `runLoop`, `observeQuestions`, `score`, `recordAttempt`, `saveNote`, `saveSession`, `renderCard`, `renderStartPanel` machinery.

**Files:**
- Modify: `extension/src/entrypoints/content.ts` (augment Plan 2's file — keep `runLoop` and every Plan 2 import)
- Modify: `extension/src/entrypoints/content.test.ts` (Plan 2 created it — **append** a Plan 3 `describe` block; do not delete Plan 2's loop tests)

- [ ] **Step 1: Append a failing test block to `extension/src/entrypoints/content.test.ts`**

Plan 2's `content.test.ts` already exists with its loop tests. **Append** this new `describe` block (and the two added imports) below Plan 2's existing `describe('content loop wiring', …)` — do not touch Plan 2's tests:

```ts
// --- Plan 3 additions (badger + panel toggle + coachmark + resume) ---
import { refreshBadges, mountPanelToggle, bindPanelCoachmarks, resumeFor } from './content';
import { recordAttempt, saveSession } from '../store';
import { makeAttempt, makeSession } from '../model';

const LIST = `<div class="results-page"><table class="question-bank-results"><tbody>
  <tr class="result-row"><td class="qid">Question ID: ab12cd34</td></tr>
  <tr class="result-row"><td class="qid">Question ID: ef56ab78</td></tr>
</tbody></table></div>`;

describe('content wiring (Plan 3)', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('refreshBadges reads the store and badges the on-screen list', async () => {
    const db = await freshDb();
    await recordAttempt(db, makeAttempt({ deviceId: 'd', questionId: 'ab12cd34', section: 'Math', domain: 'Algebra', skill: 'X', difficulty: 'Hard', pick: 'B', correct: false }));
    document.body.innerHTML = LIST;
    await refreshBadges(db, document.querySelector('.results-page')!);
    const chips = document.querySelectorAll('.fp-badge');
    expect(chips).toHaveLength(2);
    expect(chips[0]!.getAttribute('data-state')).toBe('missed');   // ab12cd34 was missed
    expect(chips[1]!.getAttribute('data-state')).toBe('new');      // ef56ab78 unseen
  });

  it('mountPanelToggle adds a single toggle button (idempotent)', () => {
    mountPanelToggle(document);
    mountPanelToggle(document);
    expect(document.querySelectorAll('.fp-panel-toggle')).toHaveLength(1);
  });

  it('bindPanelCoachmarks: clicking a Practice link drops a coachmark whose confirm re-badges', async () => {
    const db = await freshDb();
    document.body.innerHTML = LIST;
    const hostEl = document.createElement('div'); document.body.appendChild(hostEl);
    const host = hostEl.attachShadow({ mode: 'open' });
    host.innerHTML = '<a class="fp-practice-link" data-skill="Inferences" href="#">Practice Inferences on CB</a>';

    bindPanelCoachmarks(host, db, document.querySelector('.results-page')!);
    (host.querySelector('a.fp-practice-link') as HTMLElement).click();
    const mark = host.querySelector('.fp-coachmark')!;
    expect(mark.textContent).toContain('Inferences');             // coachmark names the skill to filter
    (host.querySelector('.fp-coachmark-confirm') as HTMLElement).click();
    expect(document.querySelectorAll('.fp-badge').length).toBe(2); // confirm re-ran the badger (highlight)
  });

  it('resumeFor reads getSession and scrolls to lastQuestionId (contract §2.3)', async () => {
    const db = await freshDb();
    const s = makeSession({ deviceId: 'd', filterContext: 'SAT|Math|Algebra|Hard', orderMode: 'list', shuffleSeed: 0 });
    s.lastQuestionId = 'ef56ab78';
    await saveSession(db, s);
    document.body.innerHTML = LIST;
    const result = await resumeFor(db, document.querySelector('.results-page')!, 'SAT|Math|Algebra|Hard');
    expect(result).not.toBeNull();
    expect(result!.plan.resumeId).toBe('ef56ab78');
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `cd extension && npx vitest run src/entrypoints/content.test.ts`
Expected: FAIL — `content.ts` does not yet export `refreshBadges` / `mountPanelToggle` / `bindPanelCoachmarks` / `resumeFor` (Plan 2's loop tests still pass).

- [ ] **Step 3: Augment `extension/src/entrypoints/content.ts`**

**Keep Plan 2's file verbatim** (the `runLoop` export, its imports, the start-panel/scored-loop wiring, and the boot block). Make exactly two edits:

**(a) Add these imports** to the top of the file, beside Plan 2's existing imports:
```ts
import { badge } from '../ui/badger';
import { getSeen, getMistakes } from '../journal';
import { renderPanel } from '../ui/panel';
import { deriveStats } from '../stats';
import { getAttempts } from '../store';
import { resumeSession, type ResumeResult } from '../ui/resume';
import { dropCoachmark } from '../ui/coachmark';
```

**(b) Append these exports** below `runLoop` (above Plan 2's boot block) — they are additive; none touches the scored loop:
```ts
// Find CB's results list on the page (isolated row→node knowledge stays in list-reader; here we
// only need the container the badger walks).
export function findResultsList(doc: Document): Element | null {
  return doc.querySelector('.results-page');
}

/** Read the store and (re)badge the on-screen results list with done/missed/new chips. */
export async function refreshBadges(db: IDBPDatabase, listRoot: Element): Promise<void> {
  badge(listRoot, await getSeen(db));
}

/** Add the journal-panel toggle button to the page (idempotent). Clicking mounts the panel. */
export function mountPanelToggle(doc: Document, onOpen: () => void = () => {}): HTMLButtonElement {
  const existing = doc.querySelector<HTMLButtonElement>('.fp-panel-toggle');
  if (existing) return existing;
  const btn = doc.createElement('button');
  btn.className = 'fp-panel-toggle';
  btn.textContent = 'Journal';
  btn.addEventListener('click', onOpen);
  doc.body.appendChild(btn);
  return btn;
}

/** Contract §2.3 resume read, used by the start panel's onResume and the integration boot. */
export function resumeFor(db: IDBPDatabase, listRoot: Element, filterContext: string): Promise<ResumeResult | null> {
  return resumeSession(db, listRoot, filterContext);
}

/** Wire the panel's Practice/Find coachmark links: open CB (the <a> default) AND drop a coachmark
 *  that, on confirm, re-runs the badger to highlight the now-filtered questions (spec §7 hand-off).
 *  We never automate CB's filter — the student sets it (D3); confirm only re-badges what's on screen. */
export function bindPanelCoachmarks(host: ShadowRoot, db: IDBPDatabase, listRoot: Element): void {
  host.querySelectorAll<HTMLAnchorElement>('a.fp-practice-link, a.fp-find-link').forEach((a) => {
    a.addEventListener('click', () => {
      const skill = a.dataset.skill ?? '';
      dropCoachmark(host, { skill, onConfirm: () => void refreshBadges(db, listRoot) });
    });
  });
}
```

**(c) Replace Plan 2's `onResume` stub.** Plan 2's `renderStartPanel(...)` call passes `onResume: () => start(existing?.orderMode ?? 'list')`. Change that one handler so Resume performs the contract §2.3 read before starting the loop:
```ts
    onResume: async () => {
      const list = findResultsList(doc);
      if (list) await resumeFor(db, list, existing!.filterContext);   // read getSession, rebuild order, scroll
      void start(existing?.orderMode ?? 'list');
    },
```

- [ ] **Step 4: Run it; verify it passes**

Run: `cd extension && npx vitest run src/entrypoints/content.test.ts`
Expected: PASS — Plan 2's loop tests (3) **and** Plan 3's wiring tests (4) all green; the scored loop is untouched, the badger/panel/coachmark/resume are wired.

- [ ] **Step 5: Commit**

```bash
git add extension/src/entrypoints/content.ts extension/src/entrypoints/content.test.ts
git commit -m "feat(extension): augment content script with badger + panel toggle + coachmark + resume read (keeps Plan 2's scored loop)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Toolbar popup — link to CB QB + open journal

Add the toolbar popup (spec §9 component #9, §4 step 1): an "Open SAT Question Bank" **plain link** (expressly permitted, D3) and an "Open journal" button that messages the content script to mount the panel. Covers spec §7 (toolbar opens the journal/progress panel).

**Files:**
- Create: `extension/src/entrypoints/popup.ts`, `extension/src/entrypoints/popup.test.ts`

- [ ] **Step 1: Write the failing test `extension/src/entrypoints/popup.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { renderPopup, CB_SEARCH_URL } from './popup';

describe('renderPopup', () => {
  beforeEach(() => { document.body.innerHTML = '<div id="root"></div>'; });

  it('renders a plain link to CB\'s Question Bank (student drives — D3)', () => {
    renderPopup(document.getElementById('root')!);
    const link = document.querySelector('a.fp-open-qb') as HTMLAnchorElement;
    expect(link.href).toBe(CB_SEARCH_URL);
    expect(link.target).toBe('_blank');
    expect(link.textContent).toContain('Open SAT Question Bank');
  });

  it('renders an "Open journal" button', () => {
    renderPopup(document.getElementById('root')!);
    expect(document.querySelector('button.fp-open-journal')!.textContent).toContain('Open journal');
  });

  it('shows the non-affiliation notice (spec §10)', () => {
    renderPopup(document.getElementById('root')!);
    expect(document.body.textContent).toContain('Not affiliated');
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `cd extension && npx vitest run src/entrypoints/popup.test.ts`
Expected: FAIL — cannot import from `./popup`.

- [ ] **Step 3: Create `extension/src/entrypoints/popup.ts`**

```ts
// Toolbar popup (spec §9 #9, §4 step 1). A plain link to CB's Question Bank (expressly permitted,
// D3) plus an "Open journal" button that tells the active tab's content script to mount the panel.
// No CB content is ever read here. Built with createElement (no innerHTML in the popup surface).
export const CB_SEARCH_URL = 'https://satsuiteeducatorquestionbank.collegeboard.org/digital/search';

export function renderPopup(root: HTMLElement): void {
  root.replaceChildren();

  const link = document.createElement('a');
  link.className = 'fp-open-qb';
  link.href = CB_SEARCH_URL;
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = 'Open SAT Question Bank';

  const journal = document.createElement('button');
  journal.className = 'fp-open-journal';
  journal.textContent = 'Open journal';
  journal.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const id = tabs[0]?.id;
        if (id !== undefined) chrome.tabs.sendMessage(id, { type: 'open-journal' });
        window.close();
      });
    }
  });

  const notice = document.createElement('p');
  notice.className = 'fp-notice';
  notice.textContent = 'Not affiliated with, authorized, or endorsed by College Board; SAT is a trademark of the College Board.';

  root.append(link, journal, notice);
}

if (typeof document !== 'undefined' && document.getElementById('root') && typeof chrome !== 'undefined' && chrome.runtime?.id) {
  renderPopup(document.getElementById('root')!);
}
```

- [ ] **Step 4: Run it; verify it passes**

Run: `cd extension && npx vitest run src/entrypoints/popup.test.ts`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add extension/src/entrypoints/popup.ts extension/src/entrypoints/popup.test.ts
git commit -m "feat(extension): toolbar popup (open CB QB link + open-journal button + non-affiliation notice)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Mount the journal panel — `handleMessage` + augment the boot

The popup messages the content script (`{type:'open-journal'}`); the content script must respond by mounting the panel. Add the **single panel-mount path** `handleMessage(db, msg)` (the toggle button and the popup message both go through it — there is no separate `openPanel`), then augment Plan 2's boot block so it also: badges the list, wires `mountPanelToggle` → `handleMessage`, binds the panel's coachmarks, and registers `chrome.runtime.onMessage`. Plan 2's `runLoop` boot stays; this only **adds** the Plan-3 wiring around it.

**Files:**
- Modify: `extension/src/entrypoints/content.ts`, `extension/src/entrypoints/content.test.ts`

- [ ] **Step 1: Add a failing test to `extension/src/entrypoints/content.test.ts`**

Append two specs inside the `describe('content wiring (Plan 3)', …)` block added in Task 6:
```ts
  it('handleMessage("open-journal") mounts the panel into the shared host', async () => {
    const db = await freshDb();
    await handleMessage(db, { type: 'open-journal' });
    // The shared host carries id HOST_ID; the panel section lands inside its shadow root.
    const host = document.getElementById(HOST_ID);
    expect(host).not.toBeNull();
    expect(host!.shadowRoot!.querySelector('.fp-panel')).not.toBeNull();
  });

  it('handleMessage ignores unrelated message types', async () => {
    const db = await freshDb();
    await handleMessage(db, { type: 'something-else' });
    expect(document.getElementById(HOST_ID)).toBeNull();
  });
```

And extend the Plan 3 import block at the top of the test file (add `handleMessage` to the existing `./content` import and import `HOST_ID`):
```ts
import { refreshBadges, mountPanelToggle, bindPanelCoachmarks, resumeFor, handleMessage } from './content';
import { HOST_ID } from '../ui/host';
```

- [ ] **Step 2: Run it; verify it fails**

Run: `cd extension && npx vitest run src/entrypoints/content.test.ts`
Expected: FAIL — `content.ts` does not export `handleMessage` (Plan 2's loop tests + Task 6's Plan 3 tests still pass).

- [ ] **Step 3: Augment `extension/src/entrypoints/content.ts`**

**(a) Add the `mountHost` import** if Plan 2 did not already import it for the loop (Plan 2 imports `mountHost` from `../ui/host` for `runLoop`; reuse that import — do not add a duplicate).

**(b) Append the single panel-mount path** `handleMessage` below the Task 6 exports (still above the boot block):
```ts
/** Single panel-mount path: the toggle button and the popup's open-journal message both call this. */
export async function handleMessage(db: IDBPDatabase, msg: { type?: string }): Promise<void> {
  if (msg?.type !== 'open-journal') return;
  const host = mountHost(document);
  renderPanel(host, { stats: deriveStats(await getAttempts(db)), mistakes: await getMistakes(db) });
}
```

**(c) Augment Plan 2's boot block** — do NOT replace it. Plan 2's boot is `void openStore().then((db) => runLoop(document, db, deviceId()))`. Extend it so the same `db` also wires the Plan 3 surface (badger, toggle, coachmarks, message listener). Replace Plan 2's one-line boot with:
```ts
// Boot (skipped under test: no chrome runtime). Plan 2 runs the scored loop; Plan 3 adds the
// badger + journal panel toggle + coachmark binding + the open-journal message listener.
if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
  void (async () => {
    const db = await openStore();
    await runLoop(document, db, deviceId());                  // Plan 2 scored loop (unchanged)

    mountPanelToggle(document, () => void handleMessage(db, { type: 'open-journal' }));
    const list = findResultsList(document);
    if (list) {
      await refreshBadges(db, list);
      bindPanelCoachmarks(mountHost(document), db, list);     // panel links → coachmark → re-badge
    }
    observeQuestions(document, () => {
      const l = findResultsList(document);
      if (l) void refreshBadges(db, l);
    });
    chrome.runtime.onMessage.addListener((m: { type?: string }) => { void handleMessage(db, m); });
  })();
}
```

> `deviceId()` is Plan 2's local install-id helper, already defined in `content.ts`. No `openPanel` helper exists in this file — `handleMessage` is the only panel-mount path, so there is nothing to rename or remove.

- [ ] **Step 4: Run it; verify it passes**

Run: `cd extension && npx vitest run src/entrypoints/content.test.ts`
Expected: PASS — Plan 2's loop tests (3) + Plan 3's wiring tests (6: badges, toggle, coachmark, resume, handleMessage mounts, handleMessage ignores).

- [ ] **Step 5: Commit**

```bash
git add extension/src/entrypoints/content.ts extension/src/entrypoints/content.test.ts
git commit -m "feat(extension): handleMessage panel-mount path + boot wiring for badger/toggle/coachmark/open-journal

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Popup HTML + manifest action + build wiring

Add `popup.html`, point `manifest.json`'s `action.default_popup` at it, and teach `scripts/build.mjs` to bundle the popup entrypoint and copy `popup.html` into `dist/`. Covers spec §9 #9 (toolbar/popup) packaging.

**Files:**
- Create: `extension/popup.html`
- Modify: `extension/manifest.json`, `extension/scripts/build.mjs`

- [ ] **Step 1: Create `extension/popup.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Focused Practice</title>
    <style>
      body { font: 14px/1.4 system-ui, sans-serif; margin: 0; padding: 12px; width: 240px; }
      .fp-open-qb { display: block; margin-bottom: 8px; }
      .fp-open-journal { display: block; width: 100%; padding: 6px; margin-bottom: 8px; }
      .fp-notice { color: #666; font-size: 11px; margin: 0; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script src="popup.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Modify `extension/manifest.json` — set `action.default_popup`**

Change the `action` block from:
```json
  "action": { "default_title": "Focused Practice" }
```
to:
```json
  "action": { "default_title": "Focused Practice", "default_popup": "popup.html" }
```

- [ ] **Step 3: Modify `extension/scripts/build.mjs` — add the popup entrypoint + copy the HTML**

Change the `entryPoints` map to add the popup:
```js
  entryPoints: {
    background: 'src/entrypoints/background.ts',
    content: 'src/entrypoints/content.ts',
    popup: 'src/entrypoints/popup.ts',
  },
```
And add a copy after the manifest copy:
```js
await copyFile('manifest.json', 'dist/manifest.json');
await copyFile('popup.html', 'dist/popup.html');
console.log('Built extension to dist/');
```

- [ ] **Step 4: Build the extension; verify the popup is emitted**

Run: `cd extension && npm run build`
Expected: `Built extension to dist/`. Confirm the new artifacts:
```bash
ls extension/dist/popup.js extension/dist/popup.html extension/dist/manifest.json
```
Expected: all three paths exist.

- [ ] **Step 5: Verify the manifest action points at the popup**

Run: `cd extension && node -e "const m=require('./dist/manifest.json'); if(m.action.default_popup!=='popup.html'){process.exit(1)} console.log('popup wired:', m.action.default_popup)"`
Expected: `popup wired: popup.html`.

- [ ] **Step 6: Commit**

```bash
git add extension/popup.html extension/manifest.json extension/scripts/build.mjs
git commit -m "feat(extension): toolbar popup packaging (popup.html + manifest action + build wiring)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Full suite green — typecheck + tests + build + legal guard

Final integration gate: the whole suite (including Plan 1's legal CI guard `tests/guard-ci.test.ts`, which now also scans the new `journal.ts`/`list-reader.ts`/`ui/*`/`popup.ts` source) must be green, the build must succeed, and typecheck must be clean. Plan 2's loop tests in `content.test.ts` must still pass — Plan 3 augmented that file, it did not rewrite it.

**Files:** none (verification only).

- [ ] **Step 1: Typecheck the whole project**

Run: `cd extension && npm run typecheck`
Expected: no errors (clean exit). All new modules type against the frozen `Attempt/Note/Session/Stats` + the reused `mountHost`/`html`/`shuffleIds`/`getSession` signatures.

- [ ] **Step 2: Run the full test suite**

Run: `cd extension && npm test`
Expected: ALL tests PASS — Plan 1 (smoke, model, guard, store, scoring, stats, merge, reader, observer, guard-ci) + Plan 2 (order, host, view-model, calculator, card, start-panel, content loop, manifest) + Plan 3 (journal, list-reader, badger, resume, panel, coachmark, content wiring, popup). The legal CI guard reports every `src/**` file (now including `journal.ts`, `cb/list-reader.ts`, `ui/badger.ts`, `ui/panel.ts`, `ui/resume.ts`, `ui/coachmark.ts`, `entrypoints/popup.ts`, `entrypoints/content.ts`) as clean: no `qbank-api`, no `fetch` to `collegeboard.org` (our coachmark links are plain `<a href>` / `chrome.tabs`, not network calls). Confirm exactly one `trustedTypes.createPolicy('focused-practice', …)` exists in the codebase — in `ui/host.ts` only (Plan 3 routes through `html()`):
```bash
grep -rn "createPolicy" extension/src | grep -v host.ts
```
Expected: no output (no other module creates the policy).

- [ ] **Step 3: Build the extension**

Run: `cd extension && npm run build`
Expected: `Built extension to dist/` with `dist/{background,content,popup}.js`, `dist/manifest.json`, `dist/popup.html`.

- [ ] **Step 4: Commit (only if any incidental fixes were needed)**

If steps 1–3 required no changes, there is nothing to commit. If a typecheck/guard fix was needed:
```bash
git add -A extension
git commit -m "chore(extension): green typecheck + full suite + build for Plan 3

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-review (completed during planning)

### Spec / contract coverage

| Spec section / decision | Where implemented |
|---|---|
| D6 — Mistake journal (notes + weak-area stats + guided re-surface) | Task 1 (`getMistakes`/`getSeen`), Task 3 (badger), Task 5 (panel mistakes list) |
| D9 — Guided resume of session context | Task 4 (`planResume`/`scrollToResume`/`resumeSession`), Task 6 (`onResume`→`resumeFor`), Task 8 (boot wires it) — end-to-end: `getSession` read + scroll, surfaced by the start panel's Resume |
| §6 — Weak-areas / accuracy / streaks derive from the append-only event log | Task 1 (selectors over `getAttempts` + `deriveStats`), Task 5 (bars + stats) |
| §6 guardrail / §10 — no comprehensive `questionId→metadata` index; taxonomy per-attempt only | Task 1 (reads taxonomy from `Attempt` rows; adds no index), Task 5 (renders per-mistake context, not a global map) |
| §7 — Journal/progress panel (done/accuracy/streak, worst-first weak-area bars, mistakes list, "Practice [skill] on CB"/"Find on CB") | Task 5 (`renderPanel`) |
| §7 — Badged list (`✓ done / ⚠ missed / new`) | Task 3 (`badge`), Task 6 (`refreshBadges`) |
| §7 / §4 — Practice/Find drops a coachmark to set the filter, then the badger highlights the relevant questions | Task 5 (`data-skill` link hook), Task 5b (`dropCoachmark`), Task 6 (`bindPanelCoachmarks`: link click → coachmark → confirm re-runs `refreshBadges`) |
| §7 / §4 step 6 — toolbar opens the journal/progress panel | Task 7 (popup "Open journal"), Task 8 (content `handleMessage`) |
| §4 step 1 / D3 — Practice/Find/popup open CB via a plain `<a href>`; the student sets CB's filter (we never automate it) | Task 5 (`CB_SEARCH_URL` `<a target=_blank>`), Task 5b (coachmark coaches; never touches CB controls), Task 7 (popup link) |
| §5 #7 — badger depends on isolated CB-list DOM | Task 2 (`list-reader.ts`), Task 3 (badger consumes it) |
| §8.4 — Shadow DOM + TrustedHTML from day one | Task 5 + Task 5b route panel/coachmark innerHTML through `host.ts`'s `html()` (the single `TT_POLICY` owner — no second `createPolicy`); badger/popup avoid innerHTML entirely (`textContent`/`createElement`) |
| §9 — synthetic fixtures only; legal CI guard scans all source | Task 2 (`results-list.html` `[SYNTHETIC]`), Task 10 (guard-ci over new files) |
| §10 — non-affiliation notice | Task 7 (popup notice) |
| Contract §2.1 — reuse `mountHost`/`HOST_ID`/`TT_POLICY` + `html()`; ONE policy, created in host.ts | Task 5 + Task 5b (`html()` only — no local `createPolicy`), Task 6 + Task 8 (`mountHost`), Task 8 (`HOST_ID` in test) |
| Contract §2.2 — reuse `shuffleIds` for resume | Task 4 (`planResume`) |
| Contract §2.3 — resume reads `getSession`, rebuilds via `shuffleIds`, scrolls to `lastQuestionId` | Task 4 (`resumeSession` reads `getSession` → `planResume` rebuilds order from `shuffleSeed` → `scrollToResume` targets `lastQuestionId`); Task 6 (`onResume`→`resumeFor`), Task 8 (boot calls it) — the read is wired, not just the helpers |
| Contract §3 — Plan 3 only *modifies* `content.ts` (augment, not rewrite) | Task 6 + Task 8 keep Plan 2's `runLoop`/scored loop and every Plan 2 import; add badger/toggle/coachmark/resume/message on top |
| Contract §1 — reuse `getAttempts`/`getNotes`/`deriveStats`; add NO store methods | Task 1 (composes them; no new `store.ts` methods) |

### Placeholder scan

No `TBD` / `TODO` / "implement later" / "add error handling" / "similar to Task N" placeholders. Every task (1, 2, 3, 4, 5, 5b, 6, 7, 8, 9, 10) shows real test code, the exact run command + expected output, real implementation code, and a real `git add`/`commit`. The `content.ts`/`content.test.ts` edits in Tasks 6 and 8 are spelled out as concrete append/replace operations against Plan 2's existing file — no "modify as needed" hand-waving. Task 10 is a verification-only gate with explicit acceptance commands (not a placeholder). The synthetic fixture is marked `[SYNTHETIC]` per the invariant.

### Type-consistency note

- `getSeen(db): Promise<Record<string,'done'|'missed'>>` returns exactly `Stats['seen']` (delegates to `deriveStats`); `getMistakes(db): Promise<Mistake[]>` introduces `Mistake` (a new view type local to Plan 3, not a store record — no new persisted field, so the legal guard/`store.ts` are untouched).
- `readListQuestionIds(listRoot: Element): {id,node}[]` matches contract §3 exactly (`ListRow = {id:string; node:Element}`).
- `badge(listRoot, seen)` takes `seen: Record<string,'done'|'missed'>` — the exact shape `getSeen` returns and `Stats['seen']` defines.
- `planResume` consumes `Session` (frozen Plan 1 type) and calls `shuffleIds(ids, seed): string[]` (contract §2.2) — signature matches. `resumeSession(db, listRoot, filterContext)` calls `getSession(db, filterContext): Promise<Session|undefined>` (frozen Plan 1 / contract §2.3) — signature matches; it is the single owner of the contract's "Plan 3 reads `getSession`" obligation, re-exported from `content.ts` as `resumeFor` and called from the start panel's `onResume` (Task 6) and boot (Task 8).
- `renderPanel(host: ShadowRoot, vm)` and `dropCoachmark(host: ShadowRoot, opts)` take the `ShadowRoot` that `mountHost(doc): ShadowRoot` returns (contract §2.1). Both route every `innerHTML` write through `host.ts`'s exported `html(s): unknown` helper — **neither calls `trustedTypes.createPolicy`**, so the `focused-practice` policy is created exactly once (in `host.ts`); a second `createPolicy` of that name would throw "policy already exists". `Stats`/`SkillStat` consumed from `stats.ts` unchanged; `Mistake` from `journal.ts`.
- `content.ts` is **augmented, not rewritten**: Plan 2's `runLoop(doc, db, dev): Promise<ShadowRoot>` and its scored-loop imports (`score`, `recordAttempt`, `saveNote`, `saveSession`, `renderCard`, `renderStartPanel`) stay; Plan 3 **adds** `findResultsList`, `refreshBadges`, `mountPanelToggle`, `bindPanelCoachmarks`, `resumeFor`, `handleMessage` and one boot block that calls `runLoop` first, then wires the Plan 3 surface. `content.test.ts` is likewise **appended to** (Plan 2 created it) — Plan 2's loop tests are preserved.
- No frozen Plan 1 API is redefined; no Plan 2/4-owned file is created here. `mountHost`, `HOST_ID`, `TT_POLICY`, `html`, `shuffleIds`, `getSession`, `runLoop` are imported, never re-declared.
