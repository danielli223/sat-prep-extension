# Interface Contract — Plans 2, 3, 4 (SAT Practice Overlay)

*Created 2026-06-15. This is the shared spine the three overlay plans draft against so their
interfaces match. Execution is sequential (Plan 2 → 3 → 4); each plan below states what it
**creates** vs. **reuses**. Names here are normative — a plan that needs a cross-boundary symbol
MUST use the exact name/signature given here.*

> Companion docs: design spec `docs/superpowers/specs/2026-06-15-sat-practice-overlay-design.md`,
> `sat-app-legal-architecture.md`. The legal bright lines in spec §10 bind every plan.

---

## 0. The invariant every plan inherits

- Read CB's **rendered DOM only**. Never call `qbank-api` / any `collegeboard.org` endpoint
  (the CI guard in `extension/tests/guard-ci.test.ts` fails the build if you do).
- Persist **only** `{ question IDs + the student's own data }`. Question **stem and explanation
  text are RAM-only** — read live, shown live, never placed in any record, any stored object,
  or anything that crosses into `store.ts`. `assertNoQuestionContent` is the backstop.
- Every question transition is **user-initiated**. No auto-advance, no prefetch, no ID enumeration.
- **No AI** on CB content, ever. Synthetic fixtures only in tests (`[SYNTHETIC]` markers).

---

## 1. Frozen Plan 1 API (reuse exactly — do NOT redefine)

All paths under `extension/`.

**`src/types.ts`**
```ts
type ISO = string; type UUID = string;
interface Envelope { userId: string|null; deviceId: UUID; createdAt: ISO; updatedAt: ISO;
  deleted: boolean; dirty: boolean; schemaVersion: number; }
interface Attempt extends Envelope { attemptId: UUID; questionId: string; section: string;
  domain: string; skill: string; difficulty: string; pick: string; correct: boolean; }
interface Note extends Envelope { noteId: UUID; questionId: string; text: string; }
interface Session extends Envelope { sessionId: UUID; filterContext: string;
  orderMode: 'list'|'random'; shuffleSeed: number; lastQuestionId: string|null; }
```

**`src/model.ts`** — `SCHEMA_VERSION = 1`; `newId(): UUID`; `nowIso(): ISO`;
`makeAttempt(i: NewAttempt): Attempt` where `NewAttempt = {deviceId,questionId,section,domain,skill,difficulty,pick,correct}`;
`makeNote({deviceId,questionId,text}): Note`;
`makeSession({deviceId,filterContext,orderMode,shuffleSeed}): Session` (sets `lastQuestionId: null`).

**`src/store.ts`** — `openStore(): Promise<IDBPDatabase>`;
`recordAttempt(db, a: Attempt)`; `getAttempts(db): Promise<Attempt[]>`;
`saveNote(db, n: Note)`; `getNotes(db): Promise<Note[]>`;
`saveSession(db, s: Session)`; `getSession(db, filterContext: string): Promise<Session|undefined>`.
Object stores: `attempts` (keyPath `attemptId`, index `byQuestion`), `notes` (keyPath `noteId`),
`sessions` (**keyPath `filterContext`** — one session per filter). Every write runs through
`assertNoQuestionContent`.

**`src/scoring.ts`** — `score(pick: string, correctAnswerRaw: string): { graded: boolean; correct: boolean }`.
`graded:false` = indeterminate → caller MUST show CB's answer with **no** red/green verdict.

**`src/stats.ts`** — `deriveStats(attempts: Attempt[]): Stats` where
`Stats = { total, correct, accuracy, perSkill: SkillStat[] /*worst accuracy first*/,
seen: Record<questionId,'done'|'missed'>, streakDays }`, `SkillStat = {skill,total,correct,accuracy}`.

**`src/merge.ts`** — `mergeRecord`, `mergeCollections` (v2 sync; not used by v1 UI).

**`src/cb/reader.ts`** — `readQuestion(root: Element): QuestionView | null` where
`QuestionView = { id, section, domain, skill, difficulty, stem /*RAM-only*/, choices: {letter,text}[],
correctAnswer: string|null, explanation: string|null /*RAM-only*/ }`. Returns `null` if no question id found.

**`src/cb/observer.ts`** — `observeQuestions(doc: Document, onShown: (v: QuestionView) => void): () => void`
(returns an unsubscribe fn; fires once per distinct id on `/digital/results`).

---

## 2. Cross-boundary symbols introduced in Plans 2–4 (the drift surface)

These are the ONLY symbols shared between plans. Pin them exactly.

### 2.1 Overlay host — `src/ui/host.ts` *(Plan 2 creates · Plans 3 & 4 reuse)*
```ts
// Idempotent: creates <div id="focused-practice-root"> on doc.body once, attaches an OPEN
// shadow root, installs the TrustedTypes policy "focused-practice", returns the shadow root.
// ALL extension UI (focus card, journal panel, resilience banners) mounts inside this ONE root.
export function mountHost(doc: Document): ShadowRoot;
export const HOST_ID = 'focused-practice-root';
export const TT_POLICY = 'focused-practice';   // createPolicy name; all innerHTML goes through it
// The SINGLE TrustedHTML helper. host.ts is the only place that calls createPolicy(TT_POLICY).
// Every plan routes EVERY innerHTML write through this; no other module may call createPolicy
// (a second createPolicy with the same name throws "policy already exists" in real engines).
// Feature-detects trustedTypes: returns TrustedHTML when present, the raw string under happy-dom.
export function html(s: string): unknown;
```

### 2.2 Question ordering — `src/order.ts` *(Plan 2 creates · Plan 3 reuses for resume)*
```ts
// Deterministic seeded shuffle. Same (ids, seed) ALWAYS yields the same order, so Plan 3 can
// reconstruct a randomized session's order from the persisted shuffleSeed. Pure; no Math.random.
export function shuffleIds(ids: string[], seed: number): string[];
export function newSeed(): number;   // 32-bit int; used when orderMode === 'random'
```

### 2.3 Session-resume protocol *(Plan 2 writes · Plan 3 reads)*
- On **Start**, Plan 2 calls `saveSession(db, makeSession({deviceId, filterContext, orderMode, shuffleSeed}))`.
  `filterContext` format is **`"SAT|Math|Algebra|<difficulty-or-Any>"`** (pipe-joined, from the
  CB filter the student set). `shuffleSeed` is `0` when `orderMode==='list'`, else `newSeed()`.
- On each **Next**, Plan 2 updates the live session object's `lastQuestionId`, sets
  `updatedAt = nowIso()`, `dirty = true`, and re-`saveSession`s it (keyed by `filterContext`).
- Plan 3 resume reads `getSession(db, filterContext)`; if `orderMode==='random'` it rebuilds order
  via `shuffleIds(currentListIds, session.shuffleSeed)` and scrolls to `lastQuestionId`.

### 2.4 Indeterminate / never-guess UI state *(Plan 2 owns · Plan 4 enriches)*
- If `readQuestion` returns `null`, OR `score(...).graded === false`, Plan 2's card MUST render a
  **non-verdict** state: reveal CB's own answer/explanation, show no red/green, record **no**
  attempt (or record with the actual `correct` only when `graded===true`). A wrong verdict is the
  trust-killer — never guess.
- **Reveal-gating (spike 2026-06-15, design spec §12.1):** `readQuestion(...).correctAnswer` is
  `null` until CB's "Show correct answer and explanation" control is checked — CB injects the
  rationale into the DOM only then (MC choices are present regardless). **Plan 2 owns triggering the
  reveal** (`ensureAnswerRevealed(doc)` clicks `.hide-rationale-checkbox input`) and **re-reading the
  answer at Check time** (the initial `QuestionView` predates the reveal). The focus card overlays
  the dimmed CB page, so the student never sees CB's revealed answer until our own verdict. *Legal
  flag:* this actuates a CB control — still no API/enumeration/prefetch, but raise it in IP review.
- Plan 4 layers on top: a failure counter + a "Couldn't read this one — answer it on CB" banner +
  the DOM-contract self-check. Plan 4 does this by **modifying** Plan 2's loop call sites; Plan 2
  must NOT pre-stub resilience.

### 2.5 Enablement gate *(Plan 4 owns entirely)*
- `src/resilience/killswitch.ts: isEnabled(): Promise<boolean>`. Plan 4 wraps Plan 2/3's mount
  call(s) in `if (await isEnabled())`. **Plan 2 and Plan 3 do NOT import or stub this** — they
  mount unconditionally; Plan 4 inserts the gate. This keeps Plan 2/3 free of un-built deps.

### 2.6 The `content.ts` / `content.test.ts` integration seam *(created by Plan 2 · modified additively by 3 & 4)*
There is **ONE** `src/entrypoints/content.ts` and **ONE** `src/entrypoints/content.test.ts`. They are
the shared integration point and are edited **additively** — no plan re-`Create`s or rewrites them.
- **Plan 2 creates** `content.ts`: exports `runLoop(doc, db, dev): Promise<ShadowRoot>` + the boot IIFE,
  with nested `showQuestion(view)` / `onCheck(view, pick)` / `onNext(view)` and helpers
  `deviceId()` / `filterContextOf(v)` / `countLoadedResults(doc)`. Creates `content.test.ts` with the
  loop-wiring suite. The start panel's `onResume` is a **stub** that just begins the loop (Plan 3 deepens it).
- **Plan 3 modifies** both: adds `findResultsList` / `refreshBadges` / `mountPanelToggle` /
  `bindPanelCoachmarks` / `resumeFor` / `handleMessage`, and replaces the `onResume` stub with one that
  calls `resumeFor` (the §2.3 `getSession` read). Appends its own `describe` block to `content.test.ts`.
  Keeps `runLoop` and every Plan 2 import intact.
- **Plan 4 modifies** both: four surgical edits — wrap the boot body in `guardedStart` (`isEnabled()` +
  §8.3 block notice), route `showQuestion`'s `renderCard(...)` through `handleQuestion` (§2.4 banner),
  wrap store writes in `safeWrite` (§8.5). Appends its own `describe` block. Removes nothing.

---

## 3. Plan-by-plan ownership (no two plans create the same file)

### Plan 2 — Scored overlay (the loop)  →  `2026-06-15-sat-overlay-scored-loop.md`
Creates: `src/ui/host.ts` (§2.1), `src/ui/view-model.ts` (`CardVM` + `toCardVM`; excludes
stem/explanation), `src/ui/card.ts` (`renderCard` + verdict render; cross-off, Check, reveal,
note, Next), `src/ui/calculator.ts` (`toggleGeoGebra(root)` iframe to geogebra.org + `openDesmos()`
= `window.open('https://www.desmos.com/calculator', ...)`), `src/ui/start-panel.ts` (list /
randomize / resume-if-session), `src/order.ts` (§2.2). Modifies: `src/entrypoints/content.ts`
(mount host, run loop, record attempts/notes/session), `manifest.json` (frame-src for geogebra.org
if needed; nothing for Desmos — it's `window.open`). Reuses: readQuestion, observeQuestions, score,
makeAttempt/recordAttempt, makeNote/saveNote, makeSession/saveSession/getSession.
Spec coverage: D2 focus card, D4 explicit Check, D5 reveal CB explanation (never AI), D7 calculator,
D8 randomize, §4 loop, §7 focus card, §8.6 question-type fallback. **Open item O1** (GeoGebra
license) — note it; Desmos is the always-legal fallback.

### Plan 3 — Journal · progress · badger · resume  →  `2026-06-15-sat-overlay-journal.md`
Creates: `src/journal.ts` (`getSeen(db)`, `getMistakes(db)` selectors over getAttempts/getNotes +
deriveStats), `src/cb/list-reader.ts` (`readListQuestionIds(listRoot: Element): {id,node}[]` —
isolated CB-DOM knowledge, like reader/observer), `src/ui/panel.ts` (journal/progress panel: stats,
weak-area bars worst-first, mistakes list, "Practice [skill] on CB"/"Find on CB" coachmark links),
`src/ui/badger.ts` (`badge(listRoot, seen)` injects ✓done/⚠missed/new chips into CB's results list),
`src/ui/resume.ts` (guided resume per §2.3). Modifies: `src/entrypoints/content.ts` (wire badger +
panel toggle), `manifest.json` (`action.default_popup` → `popup.html`; add popup entrypoint), build
script for the popup. Reuses: `mountHost` (§2.1), `shuffleIds` (§2.2), getSession (§2.3), deriveStats.
Spec coverage: D6 journal, D9 resume, §7 panel + badged list, §6 weak-areas. **Guardrail:** never
build a comprehensive `questionID→metadata` index (spec §10) — store taxonomy as per-attempt context only.

### Plan 4 — Resilience · packaging · privacy  →  `2026-06-15-sat-overlay-resilience.md`
Creates: `src/resilience/killswitch.ts` (`isEnabled()` §2.5, hosted-config flag + cached default-on),
`src/resilience/block-detect.ts` (403/CB-error → disable + point to CB; never retry),
`src/resilience/contract-check.ts` (DOM-contract self-check + failure counter + the non-verdict
banner from §2.4). Modifies: Plan 2/3 mount points to add the `isEnabled()` gate + degraded banner;
`manifest.json` (host_permissions for OUR config host only; Firefox/Edge variants); adds privacy
policy + Limited-Use + non-affiliation notice; first-run trust onboarding line (spec §7). Reuses:
the host, the loop call sites. Hardens the existing CI guard (already in Plan 1 Task 8 — extend, don't
duplicate). Spec coverage: §8 error handling, §10 guardrails, §11 O2/O3, §12 step 4–5.

---

## 4. Conventions all three plans follow
- **TDD per the workspace playbook**: failing test → watch it fail → minimal code → green → commit.
  Pure logic (`order.ts`, `journal.ts`, `view-model.ts`, `list-reader.ts`, `contract-check.ts`) is
  unit-tested with Vitest + happy-dom; DOM-reading modules test against **synthetic** fixtures.
- **Shadow DOM + TrustedHTML from day one** (spec §8.4): every `innerHTML` assignment goes through
  the `TT_POLICY`. No raw string HTML injection.
- **Commits**: conventional, end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **No placeholders** in plans: every code step shows the actual code; every run step shows the exact
  command + expected output.
