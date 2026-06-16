# SAT Practice Overlay — Plan 2: Scored Overlay (the loop) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Shadow-DOM focus-card loop on top of College Board's live results page — start panel (list / randomize / resume-if-session), answer + cross-off + explicit Check + instant red/green scoring + reveal CB's own unaltered explanation + why-I-missed-it note + Next — plus an integrated GeoGebra calculator and a one-click "Open real Desmos" launcher, recording only the student's own attempts/notes/session locally.

**Architecture:** A single OPEN shadow root (`mountHost`) hosts all extension UI over a dimmed CB page (Decision D2 — additive overlay, CB visibly underneath). The content script reuses Plan 1's `observeQuestions` to feed each live `QuestionView` into a pure view-model (`toCardVM`) that *physically excludes* stem/explanation, then `renderCard` paints the focus card; scoring goes through Plan 1's `score()` with a hard never-guess branch — `readQuestion` null **or** `graded===false` reveals CB's answer with no verdict and records no attempt. Every `innerHTML` write passes through the `focused-practice` TrustedTypes policy; stem and explanation text are read live, shown live, and discarded — never stored.

**Tech Stack:** TypeScript · esbuild (bundling) · Vitest + happy-dom (tests) · fake-indexeddb (store/content tests) · idb (IndexedDB wrapper). Code lives under `extension/`. Reuses Plan 1's `types.ts`, `model.ts`, `store.ts`, `scoring.ts`, `cb/reader.ts`, `cb/observer.ts` **verbatim** (no redefinition).

**Spec:** `docs/superpowers/specs/2026-06-15-sat-practice-overlay-design.md`
**Contract:** `docs/superpowers/plans/2026-06-15-plans-2-4-interface-contract.md` (§1 frozen API · §2 cross-boundary symbols · §3 ownership · §4 conventions)

**This is Plan 2 of 4** (per the spec's build sequence §12, step 2):
1. Foundation & DOM-contract (Plan 1 — done)
2. **The scored loop** — Shadow-DOM overlay, focus card, answer/cross-off/check/score/explanation/next, randomize, calculator (GeoGebra + Open-real-Desmos) ← this plan
3. Journal, progress, re-surface badger, guided resume (toolbar panel)
4. Resilience (kill-switch, 403 detection, DOM-contract self-check) + cross-browser packaging + privacy/non-affiliation

**Legal invariant enforced throughout** (contract §0): read CB's rendered DOM only (never `qbank-api`); persist **only** `{question IDs + the student's own data}` — stem/explanation are RAM-only `LiveContent`, never stored; every transition is user-initiated; no AI on CB content. The CI guard from Plan 1 (`extension/tests/guard-ci.test.ts`) and the store's `assertNoQuestionContent` remain the backstops — this plan adds nothing that fetches CB and stores nothing CB-authored.

**Cross-boundary ownership (contract §2/§3):** this plan **creates** `src/ui/host.ts` (`mountHost`/`HOST_ID`/`TT_POLICY`, §2.1) and `src/order.ts` (`shuffleIds`/`newSeed`, §2.2), and **writes** the session-resume protocol (§2.3). It **does NOT** import or stub `isEnabled()` (§2.5 — Plan 4 inserts that gate) and **does NOT** pre-stub resilience banners (§2.4 — Plan 4 enriches the non-verdict state). Plans 3 & 4 reuse `mountHost`/`shuffleIds`.

> **Spike addendum (2026-06-15) — revealing CB's answer before scoring.** The live DOM-contract
> spike (design spec §12.1) found that CB injects the rationale — and therefore the **correct answer** —
> into the DOM **only when its "Show correct answer and explanation" checkbox is checked**; it is absent
> (not merely hidden) otherwise. MC answer choices are present regardless. So `readQuestion(...).correctAnswer`
> is `null` until that control is triggered, and the loop must trigger it or **every** question falls to the
> never-guess `graded:false` path and nothing ever scores. Two concrete additions to Task 7 (`runLoop`):
>
> 1. When a question is shown, call `ensureAnswerRevealed(doc)` so CB injects the rationale. The focus card
>    sits over the **dimmed** CB page (D2), so the student never sees CB's revealed answer until our own
>    verdict/explanation step.
>
>    ```ts
>    // Reads the rendered DOM + toggles ONE control on the CURRENT user-chosen question — no API call,
>    // no enumeration, no prefetch. Selectors observed live in the spike (.hide-rationale-checkbox).
>    function ensureAnswerRevealed(doc: Document): void {
>      const box = doc.querySelector<HTMLInputElement>('.hide-rationale-checkbox input[type="checkbox"]');
>      if (box && !box.checked) box.click();
>    }
>    ```
> 2. Read the correct answer **at Check time** from the live container (the `QuestionView` captured when the
>    modal first appeared predates the reveal), then score:
>
>    ```ts
>    function currentCorrectAnswer(doc: Document, id: string): string | null {
>      const modal = [...doc.querySelectorAll('.cb-dialog-container')]
>        .find((el) => (el.textContent ?? '').includes(`Question ID: ${id}`)) ?? null;
>      return modal ? (readQuestion(modal)?.correctAnswer ?? null) : null;
>    }
>    // in onCheck: const answer = currentCorrectAnswer(doc, view.id); const result = score(pick, answer ?? '');
>    ```
>
> **Legal review item:** programmatically checking the reveal box *actuates* a CB control — a step beyond
> purely passive reading (still no `qbank-api`, no enumeration, no prefetch; the user already chose this
> question). Surface this to the IP attorney alongside the §10 bright lines. If it doesn't clear, the fallback
> is to require the student to reveal CB's answer themselves before our verdict (less seamless, fully passive).

---

## File structure

**Created by this plan:**
```
extension/
  src/
    order.ts                        # shuffleIds(ids, seed) + newSeed() — deterministic seeded shuffle (contract §2.2)
    order.test.ts
    ui/
      host.ts                       # mountHost(doc) → ShadowRoot; HOST_ID; TT_POLICY; html() TrustedHTML helper (contract §2.1)
      host.test.ts
      view-model.ts                 # CardVM + toCardVM(view, idx, total, score) — EXCLUDES stem/explanation
      view-model.test.ts
      card.ts                       # renderCard(shadow, vm, live, handlers) + verdict render; cross-off/Check/reveal/note/Next
      card.test.ts
      calculator.ts                 # toggleGeoGebra(root) iframe + openDesmos() window.open (D7)
      calculator.test.ts
      start-panel.ts                # renderStartPanel(shadow, {hasSession}, handlers): list | Randomize | Resume-if-session (D8, §7)
      start-panel.test.ts
```

**Modified by this plan:**
```
extension/
  src/entrypoints/content.ts        # mount host; export runLoop(); record attempt/note/session (replaces Plan 1 proof-of-life log)
  src/entrypoints/content.test.ts   # NEW co-located test for the wired loop (created here)
  manifest.json                     # content_security_policy frame-src https://www.geogebra.org (only if a CSP key exists); NOTHING for Desmos
```

> **content.ts / content.test.ts are SHARED across Plans 2–4 and edited ADDITIVELY (contract §3).**
> Plan 2 creates the durable `runLoop()` body and the co-located test file. Plans 3 (badger + panel
> toggle) and Plan 4 (`isEnabled()` gate + degraded banner) **modify** content.ts by adding to /
> wrapping `runLoop()` and **append** their own `describe` blocks to content.test.ts. No plan re-writes
> content.ts from scratch or re-`Create`s content.test.ts — the scored loop and its tests survive
> through Plan 4. Keep `runLoop(doc, db, dev)` and its exported helpers stable for the later plans.

**Reused verbatim (Plan 1 — never redefined):** `readQuestion`/`QuestionView` (`cb/reader.ts`), `observeQuestions` (`cb/observer.ts`), `score`/`ScoreResult` (`scoring.ts`), `makeAttempt`/`makeNote`/`makeSession` (`model.ts`), `openStore`/`recordAttempt`/`saveNote`/`saveSession`/`getSession` (`store.ts`).

**Environment notes (verified against the installed toolchain):**
- happy-dom supports `element.attachShadow` but **`window.trustedTypes` is `undefined`**. So `host.ts` must feature-detect `trustedTypes`: when present, create the `focused-practice` policy and route all HTML through it; when absent (tests, and older browsers), fall back to assigning the raw string. Either way **all HTML goes through the one `html()` helper** — never a raw `el.innerHTML = '<...>'` at a call site.
- `crypto.randomUUID()`, `crypto.getRandomValues()`, and `new Date()` are allowed in app code. Tests use `vi.useFakeTimers()` where determinism matters and seed shuffles explicitly.

---

## Task 1: Deterministic seeded shuffle — `src/order.ts` (contract §2.2)

`shuffleIds(ids, seed)` must be a **pure** function: the same `(ids, seed)` ALWAYS yields the same order (so Plan 3 can rebuild a randomized session's order from the persisted `shuffleSeed`). No `Math.random`. `newSeed()` returns a 32-bit int via `crypto.getRandomValues`.

**Files:**
- Create: `extension/src/order.ts`, `extension/src/order.test.ts`

- [ ] **Step 1: Write the failing test `extension/src/order.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { shuffleIds, newSeed } from './order';

describe('shuffleIds', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

  it('is deterministic: same (ids, seed) yields the same order', () => {
    expect(shuffleIds(ids, 12345)).toEqual(shuffleIds(ids, 12345));
  });

  it('different seeds (usually) yield different orders', () => {
    expect(shuffleIds(ids, 1)).not.toEqual(shuffleIds(ids, 2));
  });

  it('is a permutation: same multiset, no loss, no duplication', () => {
    const out = shuffleIds(ids, 999);
    expect(out).toHaveLength(ids.length);
    expect([...out].sort()).toEqual([...ids].sort());
  });

  it('does not mutate the input array', () => {
    const input = [...ids];
    shuffleIds(input, 7);
    expect(input).toEqual(ids);
  });

  it('handles empty and single-element arrays', () => {
    expect(shuffleIds([], 5)).toEqual([]);
    expect(shuffleIds(['only'], 5)).toEqual(['only']);
  });
});

describe('newSeed', () => {
  it('returns a non-negative 32-bit integer', () => {
    const s = newSeed();
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(0xffffffff);
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `cd extension && npx vitest run src/order.test.ts`
Expected: FAIL — cannot import from `./order` (module not found).

- [ ] **Step 3: Create `extension/src/order.ts`**

```ts
// Deterministic seeded shuffle (contract §2.2). Pure — no Math.random. Same (ids, seed) ALWAYS
// yields the same order, so Plan 3 reconstructs a randomized session's order from shuffleSeed.

// mulberry32: a tiny, well-distributed 32-bit seeded PRNG. Deterministic per seed.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleIds(ids: string[], seed: number): string[] {
  const out = [...ids];               // copy: never mutate the caller's array
  const rand = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {   // Fisher–Yates with the seeded PRNG
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function newSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;   // 32-bit int; used when orderMode === 'random'
}
```

- [ ] **Step 4: Run it; verify it passes**

Run: `cd extension && npx vitest run src/order.test.ts`
Expected: PASS (6 passed) — determinism, permutation, no-mutation, edge cases, and `newSeed` bounds.

- [ ] **Step 5: Commit**

```bash
git add extension/src/order.ts extension/src/order.test.ts
git commit -m "feat(extension): deterministic seeded shuffle (shuffleIds/newSeed) for randomize + resume

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Overlay host + TrustedHTML policy — `src/ui/host.ts` (contract §2.1)

`mountHost(doc)` is **idempotent**: it creates `<div id="focused-practice-root">` on `doc.body` once, attaches an **OPEN** shadow root, installs the `focused-practice` TrustedTypes policy, and returns the shadow root. ALL extension UI mounts inside this ONE root. Because happy-dom (and some browsers) lack `trustedTypes`, the exported `html(s)` helper feature-detects it: with TT present it returns a `TrustedHTML`; without, it returns the raw string. Every `innerHTML` write in this plan goes through `html()` (spec §8.4 / contract §2.1).

**Files:**
- Create: `extension/src/ui/host.ts`, `extension/src/ui/host.test.ts`

- [ ] **Step 1: Write the failing test `extension/src/ui/host.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mountHost, HOST_ID, TT_POLICY } from './host';

beforeEach(() => { document.body.innerHTML = ''; });

describe('mountHost', () => {
  it('creates one host element with an OPEN shadow root', () => {
    const shadow = mountHost(document);
    const host = document.getElementById(HOST_ID)!;
    expect(host).not.toBeNull();
    expect(host.shadowRoot).not.toBeNull();          // OPEN root is reachable from the host
    expect(shadow).toBe(host.shadowRoot);
  });

  it('is idempotent: a second call reuses the same host + shadow root', () => {
    const first = mountHost(document);
    const second = mountHost(document);
    expect(second).toBe(first);
    expect(document.querySelectorAll(`#${HOST_ID}`)).toHaveLength(1);
  });

  it('exposes the policy name as a constant', () => {
    expect(TT_POLICY).toBe('focused-practice');
    expect(HOST_ID).toBe('focused-practice-root');
  });

  it('renders HTML into the shadow root via the html() helper', async () => {
    const { mountHost: mh, html } = await import('./host');
    const shadow = mh(document);
    shadow.innerHTML = html('<p class="hello">hi</p>') as unknown as string;
    expect(shadow.querySelector('.hello')?.textContent).toBe('hi');
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `cd extension && npx vitest run src/ui/host.test.ts`
Expected: FAIL — `./host` not found.

- [ ] **Step 3: Create `extension/src/ui/host.ts`**

```ts
// The single overlay host (contract §2.1). Idempotent: one <div id="focused-practice-root"> on
// doc.body, an OPEN shadow root, and the "focused-practice" TrustedTypes policy. ALL extension UI
// (focus card, start panel, calculator, and — in later plans — the journal panel + banners) mounts
// inside this ONE root. Spec §8.4: every innerHTML write goes through html().

export const HOST_ID = 'focused-practice-root';
export const TT_POLICY = 'focused-practice';

interface TTPolicy { createHTML(s: string): unknown; }
let policy: TTPolicy | null = null;

function ensurePolicy(): void {
  if (policy) return;
  // trustedTypes is absent in happy-dom and older browsers; degrade to the identity transform.
  const tt = (globalThis as { trustedTypes?: { createPolicy(name: string, rules: { createHTML(s: string): string }): TTPolicy } }).trustedTypes;
  if (tt) {
    policy = tt.createPolicy(TT_POLICY, { createHTML: (s: string) => s });
  } else {
    policy = { createHTML: (s: string) => s };
  }
}

// The ONLY way HTML enters the shadow root. Returns a TrustedHTML where supported, else the raw
// string — assignable to .innerHTML either way.
export function html(s: string): unknown {
  ensurePolicy();
  return policy!.createHTML(s);
}

export function mountHost(doc: Document): ShadowRoot {
  ensurePolicy();
  const existing = doc.getElementById(HOST_ID);
  if (existing?.shadowRoot) return existing.shadowRoot;
  const host = doc.createElement('div');
  host.id = HOST_ID;
  doc.body.appendChild(host);
  return host.attachShadow({ mode: 'open' });
}
```

- [ ] **Step 4: Run it; verify it passes**

Run: `cd extension && npx vitest run src/ui/host.test.ts`
Expected: PASS (4 passed) — single idempotent host, open root, named constants, HTML renders through `html()`.

- [ ] **Step 5: Commit**

```bash
git add extension/src/ui/host.ts extension/src/ui/host.test.ts
git commit -m "feat(extension): idempotent shadow-DOM host + TrustedTypes policy (focused-practice)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Card view-model — `src/ui/view-model.ts` (excludes stem/explanation)

`toCardVM` converts a Plan 1 `QuestionView` + position + (optional) `ScoreResult` into a `CardVM` the renderer consumes. The legal point of this module: the `CardVM` type has **no `stem` and no `explanation` field** — those are RAM-only `LiveContent` handed to the renderer separately and never modelled into anything that could be stored. The VM carries only IDs, taxonomy, choice letters/text, the answer-known flag, and verdict state.

**Files:**
- Create: `extension/src/ui/view-model.ts`, `extension/src/ui/view-model.test.ts`

- [ ] **Step 1: Write the failing test `extension/src/ui/view-model.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { toCardVM, type CardVM } from './view-model';
import type { QuestionView } from '../cb/reader';

const mc: QuestionView = {
  id: 'ab12cd34', section: 'Math', domain: 'Algebra', skill: 'Linear equations in one variable',
  difficulty: 'Hard', stem: 'STEM TEXT — must not leak', choices: [
    { letter: 'A', text: '3' }, { letter: 'B', text: '5' }, { letter: 'C', text: '7' }, { letter: 'D', text: '15' },
  ], correctAnswer: 'B', explanation: 'EXPLANATION TEXT — must not leak',
};

describe('toCardVM', () => {
  it('carries IDs/taxonomy/choices and the position header', () => {
    const vm = toCardVM(mc, 0, 10);
    expect(vm.id).toBe('ab12cd34');
    expect(vm.skill).toBe('Linear equations in one variable');
    expect(vm.difficulty).toBe('Hard');
    expect(vm.choices.map((c) => c.letter)).toEqual(['A', 'B', 'C', 'D']);
    expect(vm.position).toEqual({ index: 1, total: 10 });   // 1-based "Q 1 of 10"
    expect(vm.answerKnown).toBe(true);
    expect(vm.kind).toBe('mc');
  });

  it('NEVER carries stem or explanation text (RAM-only LiveContent stays out of the VM)', () => {
    const vm = toCardVM(mc, 0, 1);
    const json = JSON.stringify(vm);
    expect(json).not.toContain('STEM TEXT');
    expect(json).not.toContain('EXPLANATION TEXT');
    expect((vm as Record<string, unknown>).stem).toBeUndefined();
    expect((vm as Record<string, unknown>).explanation).toBeUndefined();
  });

  it('marks a grid-in question (no choices) with kind "grid"', () => {
    const grid: QuestionView = { ...mc, id: 'ef56ab78', choices: [], correctAnswer: '5' };
    expect(toCardVM(grid, 2, 4).kind).toBe('grid');
  });

  it('sets answerKnown=false when CB has not revealed the answer yet', () => {
    expect(toCardVM({ ...mc, correctAnswer: null }, 0, 1).answerKnown).toBe(false);
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `cd extension && npx vitest run src/ui/view-model.test.ts`
Expected: FAIL — `./view-model` not found.

- [ ] **Step 3: Create `extension/src/ui/view-model.ts`**

```ts
import type { QuestionView } from '../cb/reader';

// CardVM is what the renderer consumes. It DELIBERATELY excludes stem + explanation: those are
// RAM-only LiveContent (contract §0) passed to renderCard separately and discarded, never modelled
// into anything that could reach the store.
export interface ChoiceVM { letter: string; text: string; }
export interface CardVM {
  id: string;
  section: string; domain: string; skill: string; difficulty: string;
  kind: 'mc' | 'grid';
  choices: ChoiceVM[];           // empty for grid-in
  answerKnown: boolean;          // CB has rendered the correct answer (reveal happened)
  position: { index: number; total: number };   // 1-based, for "Q n of N"
}

// LiveContent is the RAM-only twin handed to the renderer alongside the VM. It is never returned
// from a store getter, never persisted, never passed to model factories. Type lives here so call
// sites can name it without importing reader internals.
export interface LiveContent { stem: string; explanationGetter: () => string | null; }

export function toCardVM(view: QuestionView, index0: number, total: number): CardVM {
  return {
    id: view.id,
    section: view.section, domain: view.domain, skill: view.skill, difficulty: view.difficulty,
    kind: view.choices.length > 0 ? 'mc' : 'grid',
    choices: view.choices.map((c) => ({ letter: c.letter, text: c.text })),
    answerKnown: view.correctAnswer !== null,
    position: { index: index0 + 1, total },
  };
}
```

- [ ] **Step 4: Run it; verify it passes**

Run: `cd extension && npx vitest run src/ui/view-model.test.ts`
Expected: PASS (4 passed) — including the leak guard that stem/explanation never appear in the serialized VM.

- [ ] **Step 5: Commit**

```bash
git add extension/src/ui/view-model.ts extension/src/ui/view-model.test.ts
git commit -m "feat(extension): card view-model (toCardVM) that excludes RAM-only stem/explanation

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Calculator — `src/ui/calculator.ts` (Decision D7)

`toggleGeoGebra(root)` mounts/unmounts an `<iframe src="https://www.geogebra.org/calculator">` **inside the shadow root** (integrated free calc). `openDesmos()` calls `window.open('https://www.desmos.com/calculator', ...)` — Desmos's own free public site in a separate window, **never an iframe** (the always-legal, zero-license fallback per Open item O1). Nothing about Desmos touches the manifest.

**Files:**
- Create: `extension/src/ui/calculator.ts`, `extension/src/ui/calculator.test.ts`

- [ ] **Step 1: Write the failing test `extension/src/ui/calculator.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mountHost } from './host';
import { toggleGeoGebra, openDesmos } from './calculator';

beforeEach(() => { document.body.innerHTML = ''; });

describe('toggleGeoGebra', () => {
  it('mounts a GeoGebra iframe into the shadow root on first toggle', () => {
    const shadow = mountHost(document);
    const onAfterFirst = toggleGeoGebra(shadow);
    const iframe = shadow.querySelector('iframe.fp-geogebra') as HTMLIFrameElement | null;
    expect(iframe).not.toBeNull();
    expect(iframe!.src).toBe('https://www.geogebra.org/calculator');
    expect(onAfterFirst).toBe(true);   // now visible
  });

  it('removes the iframe on the second toggle (open → closed)', () => {
    const shadow = mountHost(document);
    toggleGeoGebra(shadow);
    const visible = toggleGeoGebra(shadow);
    expect(visible).toBe(false);
    expect(shadow.querySelector('iframe.fp-geogebra')).toBeNull();
  });
});

describe('openDesmos', () => {
  it('opens desmos.com/calculator in a separate window (not an iframe)', () => {
    const spy = vi.fn();
    vi.stubGlobal('open', spy);
    openDesmos();
    expect(spy).toHaveBeenCalledWith('https://www.desmos.com/calculator', 'fp-desmos', expect.stringContaining('width='));
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `cd extension && npx vitest run src/ui/calculator.test.ts`
Expected: FAIL — `./calculator` not found.

- [ ] **Step 3: Create `extension/src/ui/calculator.ts`**

```ts
// Calculator (Decision D7). GeoGebra is embedded INSIDE the shadow root (integrated, free).
// "Open real Desmos" launches desmos.com's own free public site in a SEPARATE window — never an
// iframe — the zero-license fallback (Open item O1). Returns the new visibility (true=open).

const GEOGEBRA_URL = 'https://www.geogebra.org/calculator';
const DESMOS_URL = 'https://www.desmos.com/calculator';

export function toggleGeoGebra(root: ShadowRoot): boolean {
  const existing = root.querySelector('iframe.fp-geogebra');
  if (existing) { existing.remove(); return false; }
  const iframe = root.ownerDocument!.createElement('iframe');
  iframe.className = 'fp-geogebra';
  iframe.src = GEOGEBRA_URL;
  iframe.title = 'GeoGebra calculator';
  iframe.setAttribute('allow', 'fullscreen');
  root.appendChild(iframe);
  return true;
}

export function openDesmos(): void {
  // Separate pinned window — the real test-day tool, on its own free site. Not an iframe.
  window.open(DESMOS_URL, 'fp-desmos', 'width=420,height=640,noopener');
}
```

- [ ] **Step 4: Run it; verify it passes**

Run: `cd extension && npx vitest run src/ui/calculator.test.ts`
Expected: PASS (3 passed) — GeoGebra iframe mounts/unmounts in the shadow root; `openDesmos` opens the Desmos site as a separate window.

- [ ] **Step 5: Commit**

```bash
git add extension/src/ui/calculator.ts extension/src/ui/calculator.test.ts
git commit -m "feat(extension): GeoGebra shadow-root embed + Open-real-Desmos launcher (D7)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Focus card render + verdict — `src/ui/card.ts` (D2, D4, D5, §7, contract §2.4)

`renderCard(shadow, vm, live, handlers)` paints the focus card into the shadow root: trust badge ("Real College Board question · live, unaltered"), progress header (`skill › difficulty`, `Q n of N`), the live stem, A–D choices with cross-off (⊘), an **explicit Check** button, a "Reveal explanation" button, a one-line note field, Next, and a calculator pin. `renderVerdict(shadow, result, live)` is the post-Check paint:
- `result.graded === true` → light the chosen + correct choices red/green (D4 instant scoring), enable the note field.
- `result.graded === false` (or the answer was never readable — contract §2.4) → render the **non-verdict** state: reveal CB's own answer/explanation, **no red/green**, a plain "Couldn't grade this one — here is CB's answer" line. This module owns the indeterminate UI; Plan 4 enriches it (do not pre-stub a failure counter or banner here).

The explanation is revealed by calling `live.explanationGetter()` **at click time** and writing it through `html()`, labelled "College Board's explanation — unaltered" (D5 / spec §7 / O6). It is read live and discarded; never stored.

**Files:**
- Create: `extension/src/ui/card.ts`, `extension/src/ui/card.test.ts`

- [ ] **Step 1: Write the failing test `extension/src/ui/card.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mountHost } from './host';
import { renderCard, renderVerdict } from './card';
import { toCardVM, type LiveContent } from './view-model';
import { score } from '../scoring';
import type { QuestionView } from '../cb/reader';

const mc: QuestionView = {
  id: 'ab12cd34', section: 'Math', domain: 'Algebra', skill: 'Linear equations in one variable',
  difficulty: 'Hard', stem: 'If 3x + 7 = 22, what is x? [SYNTHETIC]', choices: [
    { letter: 'A', text: '3' }, { letter: 'B', text: '5' }, { letter: 'C', text: '7' }, { letter: 'D', text: '15' },
  ], correctAnswer: 'B', explanation: 'Subtract 7, divide by 3. [SYNTHETIC]',
};
const live = (v: QuestionView): LiveContent => ({ stem: v.stem, explanationGetter: () => v.explanation });

beforeEach(() => { document.body.innerHTML = ''; });

function noop() { return {
  onSelect: vi.fn(), onEliminate: vi.fn(), onCheck: vi.fn(), onReveal: vi.fn(), onNote: vi.fn(),
  onNext: vi.fn(), onToggleCalc: vi.fn(), onOpenDesmos: vi.fn() }; }

describe('renderCard', () => {
  it('paints trust badge, header, stem, A–D choices, and the controls', () => {
    const shadow = mountHost(document);
    renderCard(shadow, toCardVM(mc, 0, 10), live(mc), noop());
    expect(shadow.querySelector('.fp-trust')!.textContent).toContain('unaltered');
    expect(shadow.querySelector('.fp-progress')!.textContent).toContain('Q 1 of 10');
    expect(shadow.querySelector('.fp-stem')!.textContent).toContain('3x + 7');
    expect(shadow.querySelectorAll('.fp-choice')).toHaveLength(4);
    expect(shadow.querySelector('.fp-check')).not.toBeNull();
    expect(shadow.querySelector('.fp-next')).not.toBeNull();
    expect(shadow.querySelector('.fp-calc-pin')).not.toBeNull();
  });

  it('Check fires onCheck with the selected letter; cross-off fires onEliminate', () => {
    const shadow = mountHost(document);
    const h = noop();
    renderCard(shadow, toCardVM(mc, 0, 1), live(mc), h);
    (shadow.querySelector('.fp-choice[data-letter="B"] .fp-pick') as HTMLElement).click();
    (shadow.querySelector('.fp-choice[data-letter="C"] .fp-eliminate') as HTMLElement).click();
    (shadow.querySelector('.fp-check') as HTMLElement).click();
    expect(h.onSelect).toHaveBeenCalledWith('B');
    expect(h.onEliminate).toHaveBeenCalledWith('C');
    expect(h.onCheck).toHaveBeenCalledWith('B');
  });

  it('renders a grid-in input instead of choices for kind "grid"', () => {
    const grid: QuestionView = { ...mc, id: 'ef56ab78', choices: [], correctAnswer: '5' };
    const shadow = mountHost(document);
    renderCard(shadow, toCardVM(grid, 0, 1), live(grid), noop());
    expect(shadow.querySelector('.fp-gridin')).not.toBeNull();
    expect(shadow.querySelectorAll('.fp-choice')).toHaveLength(0);
  });
});

describe('renderVerdict (instant red/green — D4)', () => {
  // The caller marks the correct choice with data-correct="true" before renderVerdict (the loop
  // does this in Task 7); renderVerdict lights GREEN whichever choice carries that hook.
  it('graded correct: lights the chosen choice green, marks correct', () => {
    const shadow = mountHost(document);
    renderCard(shadow, toCardVM(mc, 0, 1), live(mc), noop());
    (shadow.querySelector('.fp-choice[data-letter="B"]') as HTMLElement).dataset.correct = 'true';
    renderVerdict(shadow, { pick: 'B', result: score('B', 'B') }, live(mc));
    expect(shadow.querySelector('.fp-choice[data-letter="B"]')!.classList.contains('fp-correct')).toBe(true);
    expect(shadow.querySelector('.fp-verdict')!.textContent).toContain('Correct');
  });

  it('graded wrong: chosen red, correct green', () => {
    const shadow = mountHost(document);
    renderCard(shadow, toCardVM(mc, 0, 1), live(mc), noop());
    (shadow.querySelector('.fp-choice[data-letter="B"]') as HTMLElement).dataset.correct = 'true';
    renderVerdict(shadow, { pick: 'A', result: score('A', 'B') }, live(mc));
    expect(shadow.querySelector('.fp-choice[data-letter="A"]')!.classList.contains('fp-wrong')).toBe(true);
    expect(shadow.querySelector('.fp-choice[data-letter="B"]')!.classList.contains('fp-correct')).toBe(true);
  });

  it('NEVER-GUESS: graded===false reveals CB answer, shows NO red/green verdict (contract §2.4)', () => {
    const shadow = mountHost(document);
    const unreadable: QuestionView = { ...mc, correctAnswer: null };
    renderCard(shadow, toCardVM(unreadable, 0, 1), live(unreadable), noop());
    renderVerdict(shadow, { pick: 'A', result: { graded: false, correct: false } }, live(unreadable));
    expect(shadow.querySelector('.fp-correct')).toBeNull();
    expect(shadow.querySelector('.fp-wrong')).toBeNull();
    expect(shadow.querySelector('.fp-verdict')!.textContent).toContain("Couldn't grade");
  });
});

describe('explanation reveal (D5 / O6) reads live, labelled unaltered', () => {
  it('Reveal pulls CB explanation at click time, labelled "unaltered"', () => {
    const shadow = mountHost(document);
    renderCard(shadow, toCardVM(mc, 0, 1), live(mc), noop());
    (shadow.querySelector('.fp-reveal') as HTMLElement).click();
    const panel = shadow.querySelector('.fp-explanation')!;
    expect(panel.textContent).toContain('Subtract 7');
    expect(panel.textContent).toContain('unaltered');
  });

  it('note field change fires onNote with the typed text', () => {
    const shadow = mountHost(document);
    const h = noop();
    renderCard(shadow, toCardVM(mc, 0, 1), live(mc), h);
    const field = shadow.querySelector('.fp-note') as HTMLTextAreaElement;
    field.value = 'fell for the trap';
    field.dispatchEvent(new Event('change'));
    expect(h.onNote).toHaveBeenCalledWith('fell for the trap');
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `cd extension && npx vitest run src/ui/card.test.ts`
Expected: FAIL — `./card` not found.

- [ ] **Step 3: Create `extension/src/ui/card.ts`**

```ts
import { html } from './host';
import type { CardVM, LiveContent } from './view-model';
import type { ScoreResult } from '../scoring';

export interface CardHandlers {
  onSelect: (letter: string) => void;
  onEliminate: (letter: string) => void;
  onCheck: (pick: string) => void;
  onReveal: () => void;
  onNote: (text: string) => void;
  onNext: () => void;
  onToggleCalc: () => void;
  onOpenDesmos: () => void;
}
export interface Verdict { pick: string; result: ScoreResult; }

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function renderCard(shadow: ShadowRoot, vm: CardVM, live: LiveContent, h: CardHandlers): void {
  const answerBody = vm.kind === 'mc'
    ? `<ul class="fp-choices">${vm.choices.map((c) => `
        <li class="fp-choice" data-letter="${esc(c.letter)}">
          <button class="fp-eliminate" title="Cross off" aria-label="Cross off ${esc(c.letter)}">⊘</button>
          <button class="fp-pick"><span class="fp-letter">${esc(c.letter)}</span> ${esc(c.text)}</button>
        </li>`).join('')}</ul>`
    : `<label class="fp-gridin-label">Your answer
         <input class="fp-gridin" type="text" inputmode="text" autocomplete="off" />
       </label>`;

  shadow.innerHTML = html(`
    <div class="fp-card">
      <div class="fp-trust">Real College Board question · live, unaltered</div>
      <div class="fp-progress">${esc(vm.skill)} › ${esc(vm.difficulty)} · Q ${vm.position.index} of ${vm.position.total}</div>
      <div class="fp-stem">${esc(live.stem)}</div>
      ${answerBody}
      <div class="fp-actions">
        <button class="fp-check">Check</button>
        <button class="fp-reveal">Reveal explanation</button>
        <button class="fp-next">Next</button>
      </div>
      <div class="fp-verdict" aria-live="polite"></div>
      <div class="fp-explanation" hidden></div>
      <label class="fp-note-label">Why did you miss it?
        <textarea class="fp-note" rows="1" placeholder="one line — your own note"></textarea>
      </label>
      <div class="fp-calc">
        <button class="fp-calc-pin">Calculator</button>
        <button class="fp-desmos">Open real Desmos</button>
      </div>
    </div>`) as unknown as string;

  let pick: string | null = null;
  const pickValue = (): string => {
    if (vm.kind === 'grid') return (shadow.querySelector('.fp-gridin') as HTMLInputElement)?.value.trim() ?? '';
    return pick ?? '';
  };

  shadow.querySelectorAll('.fp-choice').forEach((li) => {
    const letter = (li as HTMLElement).dataset.letter!;
    li.querySelector('.fp-pick')!.addEventListener('click', () => {
      pick = letter;
      shadow.querySelectorAll('.fp-choice').forEach((x) => x.classList.remove('fp-selected'));
      li.classList.add('fp-selected');
      h.onSelect(letter);
    });
    li.querySelector('.fp-eliminate')!.addEventListener('click', () => {
      li.classList.toggle('fp-eliminated');
      h.onEliminate(letter);
    });
  });

  shadow.querySelector('.fp-check')!.addEventListener('click', () => h.onCheck(pickValue()));
  shadow.querySelector('.fp-reveal')!.addEventListener('click', () => {
    const text = live.explanationGetter();   // read CB's words LIVE at click time; never stored
    const panel = shadow.querySelector('.fp-explanation') as HTMLElement;
    panel.hidden = false;
    panel.innerHTML = html(text
      ? `<div class="fp-explanation-label">College Board's explanation — unaltered</div><div>${esc(text)}</div>`
      : `<div class="fp-explanation-label">No explanation available — view it on CB</div>`) as unknown as string;
    h.onReveal();
  });
  shadow.querySelector('.fp-note')!.addEventListener('change', (e) =>
    h.onNote((e.target as HTMLTextAreaElement).value.trim()));
  shadow.querySelector('.fp-next')!.addEventListener('click', () => h.onNext());
  shadow.querySelector('.fp-calc-pin')!.addEventListener('click', () => h.onToggleCalc());
  shadow.querySelector('.fp-desmos')!.addEventListener('click', () => h.onOpenDesmos());
}

// Post-Check paint. graded===false (or unreadable answer) → non-verdict state (contract §2.4):
// reveal CB's answer, NO red/green. Plan 4 enriches this; do not pre-stub a counter/banner here.
//
// renderVerdict stays answer-free (the contract keeps verdict logic from holding correctAnswer):
// it lights the chosen choice red on a wrong pick, and lights GREEN whichever choice carries the
// data-correct="true" hook. The content loop (Task 7) sets that hook from the live
// QuestionView.correctAnswer before calling renderVerdict, so the correct choice goes green even
// when the student picks wrong. On a correct pick the chosen choice already carries the hook.
export function renderVerdict(shadow: ShadowRoot, v: Verdict, live: LiveContent): void {
  const verdict = shadow.querySelector('.fp-verdict') as HTMLElement;
  if (!v.result.graded) {
    const text = live.explanationGetter();
    verdict.innerHTML = html(
      `<div class="fp-indeterminate">Couldn't grade this one — here is College Board's answer${
        text ? ` (unaltered):</div><div>${esc(text)}` : '. View it on CB.'}</div>`) as unknown as string;
    return;
  }
  shadow.querySelectorAll('.fp-choice').forEach((li) => {
    const letter = (li as HTMLElement).dataset.letter!;
    if (letter === v.pick && !v.result.correct) li.classList.add('fp-wrong');
    if ((li as HTMLElement).dataset.correct === 'true') li.classList.add('fp-correct');
  });
  verdict.innerHTML = html(
    v.result.correct ? `<span class="fp-ok">Correct</span>` : `<span class="fp-no">Not quite</span>`) as unknown as string;
}
```

> Note: `renderVerdict` receives only the pick + `ScoreResult` (the contract keeps verdict logic answer-free), so the *correct* choice is lit green via the `data-correct="true"` hook the caller sets — never by re-deriving the answer inside this module. Both the card test (graded-correct and graded-wrong cases below) and the Task 7 loop set `data-correct="true"` on the correct choice before calling `renderVerdict`.

- [ ] **Step 4: Run it; verify it passes**

Run: `cd extension && npx vitest run src/ui/card.test.ts`
Expected: PASS (8 passed) — render, select/eliminate/check wiring, grid-in input, instant red/green for graded correct + wrong, the never-guess non-verdict state, and the live labelled explanation reveal.

- [ ] **Step 5: Commit**

```bash
git add extension/src/ui/card.ts extension/src/ui/card.test.ts
git commit -m "feat(extension): focus card (choices/cross-off/Check/reveal/note/Next) + verdict incl. never-guess state

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Start panel — `src/ui/start-panel.ts` (Decision D8, §4 step 3, §7)

`renderStartPanel(shadow, { hasSession }, handlers)` paints the on-results panel: **Start in list order**, **Randomize (loaded results)**, and — only when a saved session exists for this filter — **Resume where you left off** (guided; the deep resume logic is Plan 3, this panel just surfaces the button and fires `onResume`). It also carries the trust-onboarding line (spec §7).

**Files:**
- Create: `extension/src/ui/start-panel.ts`, `extension/src/ui/start-panel.test.ts`

- [ ] **Step 1: Write the failing test `extension/src/ui/start-panel.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mountHost } from './host';
import { renderStartPanel } from './start-panel';

beforeEach(() => { document.body.innerHTML = ''; });

describe('renderStartPanel', () => {
  it('offers list + randomize and hides Resume when no session exists', () => {
    const shadow = mountHost(document);
    renderStartPanel(shadow, { hasSession: false }, { onStartList: vi.fn(), onStartRandom: vi.fn(), onResume: vi.fn() });
    expect(shadow.querySelector('.fp-start-list')).not.toBeNull();
    expect(shadow.querySelector('.fp-start-random')).not.toBeNull();
    expect(shadow.querySelector('.fp-resume')).toBeNull();
    expect(shadow.querySelector('.fp-onboarding')!.textContent).toContain('never store them');
  });

  it('shows Resume when a session exists and fires the right handlers', () => {
    const shadow = mountHost(document);
    const h = { onStartList: vi.fn(), onStartRandom: vi.fn(), onResume: vi.fn() };
    renderStartPanel(shadow, { hasSession: true }, h);
    (shadow.querySelector('.fp-resume') as HTMLElement).click();
    (shadow.querySelector('.fp-start-random') as HTMLElement).click();
    (shadow.querySelector('.fp-start-list') as HTMLElement).click();
    expect(h.onResume).toHaveBeenCalledOnce();
    expect(h.onStartRandom).toHaveBeenCalledOnce();
    expect(h.onStartList).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `cd extension && npx vitest run src/ui/start-panel.test.ts`
Expected: FAIL — `./start-panel` not found.

- [ ] **Step 3: Create `extension/src/ui/start-panel.ts`**

```ts
import { html } from './host';

export interface StartPanelState { hasSession: boolean; }
export interface StartPanelHandlers {
  onStartList: () => void;
  onStartRandom: () => void;
  onResume: () => void;     // deep resume logic is Plan 3; this just surfaces + fires the button
}

export function renderStartPanel(shadow: ShadowRoot, state: StartPanelState, h: StartPanelHandlers): void {
  shadow.innerHTML = html(`
    <div class="fp-start">
      <div class="fp-onboarding">These are College Board's own questions, served live from collegeboard.org.
        We never rewrite them, never run them through AI, and never store them — only your answers and progress.</div>
      <h2 class="fp-start-title">Start focused practice</h2>
      <button class="fp-start-list">Start in list order</button>
      <button class="fp-start-random">Randomize (loaded results)</button>
      ${state.hasSession ? `<button class="fp-resume">Resume where you left off</button>` : ''}
    </div>`) as unknown as string;

  shadow.querySelector('.fp-start-list')!.addEventListener('click', () => h.onStartList());
  shadow.querySelector('.fp-start-random')!.addEventListener('click', () => h.onStartRandom());
  shadow.querySelector('.fp-resume')?.addEventListener('click', () => h.onResume());
}
```

- [ ] **Step 4: Run it; verify it passes**

Run: `cd extension && npx vitest run src/ui/start-panel.test.ts`
Expected: PASS (2 passed) — Resume hidden without a session, shown with one, all three handlers fire, onboarding line present.

- [ ] **Step 5: Commit**

```bash
git add extension/src/ui/start-panel.ts extension/src/ui/start-panel.test.ts
git commit -m "feat(extension): start panel (list / randomize / resume-if-session) + trust onboarding (D8)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Wire the loop — modify `src/entrypoints/content.ts` (§4 flow, §2.3, §2.4)

Replace Plan 1's proof-of-life log with the real user-gated loop. The content script:
1. mounts the host and renders the start panel (Resume shown if `getSession(db, filterContext)` exists);
2. on **Start**, calls `saveSession(db, makeSession({deviceId, filterContext, orderMode, shuffleSeed}))` — `shuffleSeed` is `0` for list, else `newSeed()` (contract §2.3) — and reads the loaded-results count `N` once (a plain count of CB's rendered result rows; **not** Plan 3's `readListQuestionIds` selector) so the card header can show `Q n of N`;
3. feeds each live `QuestionView` from `observeQuestions` into `toCardVM(view, index, total)` + `renderCard`, where `index` is the running 0-based position and `total` is the loaded-results count `N` (so the header reads `Q n of N`, never `Q n of n`), holding the RAM-only stem/explanation in `LiveContent`;
4. on **Check**, computes `score(pick, view.correctAnswer ?? '')`; if `view===null` OR `graded===false`, renders the non-verdict state and records **no** attempt (contract §2.4); if `graded===true`, marks the correct choice, renders red/green, and `recordAttempt(db, makeAttempt({...taxonomy, pick, correct}))`;
5. on **note change**, `saveNote(db, makeNote({deviceId, questionId, text}))`;
6. on **Next**, advances (user-initiated only), updates the live session's `lastQuestionId`, sets `updatedAt=nowIso()`, `dirty=true`, re-`saveSession`s it (contract §2.3);
7. calculator pin → `toggleGeoGebra(shadow)`, Desmos button → `openDesmos()`.

`deviceId` comes from a tiny local install id (created once in `meta`/localStorage). `filterContext` is `"SAT|Math|<domain>|<difficulty-or-Any>"` derived from the first detected question's taxonomy (we never read CB's filter form — D3). The loaded-results count `N` is read once at Start as a plain count of CB's rendered result rows (`countLoadedResults(doc)`); it is a count only — never a stored `questionID→metadata` index — and is `1` when CB shows a single open question with no surrounding list.

> This plan mounts **unconditionally**. Plan 4 wraps the mount in `if (await isEnabled())` (contract §2.5) and layers a failure counter/banner on the §2.4 state. **Do not import `isEnabled` or stub resilience here.**

> **content.ts is owned by Plan 2 and EXTENDED, not replaced, by Plans 3 & 4 (contract §3).** This file exports `runLoop(doc, db, dev)` as the single durable loop entrypoint plus the small helpers (`deviceId`, `filterContextOf`, `countLoadedResults`). Plan 3 (badger + panel toggle) and Plan 4 (`isEnabled()` gate + degraded banner) **modify** this file by adding to / wrapping `runLoop` — they MUST keep `runLoop` and its scored-loop body (start panel, card render, score, `recordAttempt`/`saveNote`/`saveSession`) intact. Likewise `src/entrypoints/content.test.ts` is created here and Plans 3 & 4 **append** their suites to it (one `describe` block per concern) — they do not re-`Create`/overwrite it. The three plans share one content.ts and one content.test.ts; their changes are additive.

**Files:**
- Modify: `extension/src/entrypoints/content.ts`
- Create: `extension/src/entrypoints/content.test.ts`

- [ ] **Step 1: Write the failing test `extension/src/entrypoints/content.test.ts`**

```ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { indexedDB } from 'fake-indexeddb';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runLoop } from './content';
import { openStore, getAttempts, getNotes, getSession } from '../store';

const here = dirname(fileURLToPath(import.meta.url));
const mc = readFileSync(join(here, '..', 'cb', '__fixtures__', 'multiple-choice.html'), 'utf8');

async function freshDb() {
  await new Promise<void>((res) => { const r = indexedDB.deleteDatabase('sat-overlay'); r.onsuccess = () => res(); r.onerror = () => res(); });
  return openStore();
}

beforeEach(() => { document.body.innerHTML = ''; history.replaceState({}, '', '/digital/results'); });

describe('content loop wiring', () => {
  it('Start → Check(correct) records one attempt, writes the session, and headers "Q n of N"', async () => {
    const db = await freshDb();
    // CB's loaded results list (10 rows) is on the page BEFORE Start, so N = 10 for the header.
    const rows = Array.from({ length: 10 }, () => '<tr><td>row</td></tr>').join('');
    document.body.innerHTML += `<table class="results-list"><tbody>${rows}</tbody></table>`;

    const shadow = await runLoop(document, db, 'dev-1');
    (shadow.querySelector('.fp-start-list') as HTMLElement).click();      // user-gated start

    document.body.innerHTML += mc;                                        // CB renders a question
    await vi.waitFor(() => expect(shadow.querySelector('.fp-card')).not.toBeNull());

    // header is "Q n of N" (N = loaded results), NOT "Q n of n".
    expect(shadow.querySelector('.fp-progress')!.textContent).toContain('Q 1 of 10');

    (shadow.querySelector('.fp-choice[data-letter="B"] .fp-pick') as HTMLElement).click();
    (shadow.querySelector('.fp-check') as HTMLElement).click();

    const attempts = await getAttempts(db);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]!.questionId).toBe('ab12cd34');
    expect(attempts[0]!.pick).toBe('B');
    expect(attempts[0]!.correct).toBe(true);
    expect(shadow.querySelector('.fp-choice[data-letter="B"]')!.classList.contains('fp-correct')).toBe(true);

    const session = await getSession(db, 'SAT|Math|Algebra|Hard');
    expect(session!.orderMode).toBe('list');
    expect(session!.shuffleSeed).toBe(0);
  });

  it('NEVER-GUESS: when the answer is unreadable, no attempt is recorded and no verdict shows', async () => {
    const db = await freshDb();
    const shadow = await runLoop(document, db, 'dev-1');
    (shadow.querySelector('.fp-start-list') as HTMLElement).click();

    document.body.innerHTML +=
      '<div role="dialog"><div>Question ID: zz99zz99</div>' +
      '<table class="meta"><tr><th>x</th></tr><tr><td>SAT</td><td>Math</td><td>Algebra</td><td>S</td><td>Hard</td></tr></table>' +
      '<div class="question-stem">stem</div></div>';   // no correct-answer node
    await vi.waitFor(() => expect(shadow.querySelector('.fp-card')).not.toBeNull());

    (shadow.querySelector('.fp-check') as HTMLElement).click();
    expect(await getAttempts(db)).toHaveLength(0);
    expect(shadow.querySelector('.fp-correct')).toBeNull();
    expect(shadow.querySelector('.fp-wrong')).toBeNull();
  });

  it('note change saves a note; Next updates session.lastQuestionId', async () => {
    const db = await freshDb();
    const shadow = await runLoop(document, db, 'dev-1');
    (shadow.querySelector('.fp-start-list') as HTMLElement).click();
    document.body.innerHTML += mc;
    await vi.waitFor(() => expect(shadow.querySelector('.fp-card')).not.toBeNull());

    const note = shadow.querySelector('.fp-note') as HTMLTextAreaElement;
    note.value = 'missed the trap'; note.dispatchEvent(new Event('change'));
    (shadow.querySelector('.fp-next') as HTMLElement).click();

    expect((await getNotes(db))[0]!.text).toBe('missed the trap');
    expect((await getSession(db, 'SAT|Math|Algebra|Hard'))!.lastQuestionId).toBe('ab12cd34');
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `cd extension && npx vitest run src/entrypoints/content.test.ts`
Expected: FAIL — `runLoop` is not exported from `./content` (Plan 1's content.ts has no such export).

- [ ] **Step 3: Replace `extension/src/entrypoints/content.ts`**

```ts
import type { IDBPDatabase } from 'idb';
import { openStore, recordAttempt, saveNote, saveSession, getSession } from '../store';
import { makeAttempt, makeNote, makeSession, nowIso, newId } from '../model';
import { observeQuestions } from '../cb/observer';
import type { QuestionView } from '../cb/reader';
import { score } from '../scoring';
import { mountHost } from '../ui/host';
import { toCardVM, type LiveContent } from '../ui/view-model';
import { renderCard, renderVerdict, type CardHandlers } from '../ui/card';
import { renderStartPanel } from '../ui/start-panel';
import { toggleGeoGebra, openDesmos } from '../ui/calculator';
import { newSeed } from '../order';
import type { Session } from '../types';

const DEVICE_KEY = 'fp-device-id';
function deviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) { id = newId(); localStorage.setItem(DEVICE_KEY, id); }
  return id;
}

// "SAT|Math|<domain>|<difficulty-or-Any>" — derived from the question's own taxonomy (we never read
// CB's filter form, per Decision D3).
function filterContextOf(v: QuestionView): string {
  return `SAT|${v.section}|${v.domain}|${v.difficulty || 'Any'}`;
}

// Loaded-results count N for the "Q n of N" header. A plain count of CB's rendered result rows —
// NOT Plan 3's readListQuestionIds selector, and NOT a stored questionID→metadata index (spec §10).
// Falls back to 1 when CB shows a single open question with no surrounding list.
function countLoadedResults(doc: Document): number {
  return Math.max(1, doc.querySelectorAll('[data-testid="result-row"], table.results-list tbody tr').length);
}

export async function runLoop(doc: Document, db: IDBPDatabase, dev: string): Promise<ShadowRoot> {
  const shadow = mountHost(doc);

  // Probe an already-present question so the start panel can offer Resume when a session exists.
  let probedFilter: string | null = null;
  const probeStop = observeQuestions(doc, (v) => { probedFilter ??= filterContextOf(v); });
  probeStop();
  const existing = probedFilter ? await getSession(db, probedFilter) : undefined;

  renderStartPanel(shadow, { hasSession: !!existing }, {
    onStartList: () => start('list'),
    onStartRandom: () => start('random'),
    onResume: () => start(existing?.orderMode ?? 'list'),   // Plan 3 deepens resume; here we just begin the loop
  });

  let session: Session | null = null;
  let stop: (() => void) | null = null;
  let total = 1;   // loaded-results count N for "Q n of N"; fixed at Start

  function start(orderMode: 'list' | 'random'): void {
    total = countLoadedResults(doc);   // read N once, before the first card paints
    let started = false;
    stop = observeQuestions(doc, (view) => {
      if (!started) {
        started = true;
        session = makeSession({
          deviceId: dev, filterContext: filterContextOf(view), orderMode,
          shuffleSeed: orderMode === 'random' ? newSeed() : 0,
        });
        void saveSession(db, session);
      }
      showQuestion(view);
    });
  }

  let index = 0;
  function showQuestion(view: QuestionView): void {
    const live: LiveContent = { stem: view.stem, explanationGetter: () => view.explanation };
    const handlers: CardHandlers = {
      onSelect: () => {},
      onEliminate: () => {},
      onCheck: (pick) => onCheck(view, pick),
      onReveal: () => {},
      onNote: (text) => { if (text) void saveNote(db, makeNote({ deviceId: dev, questionId: view.id, text })); },
      onNext: () => onNext(view),
      onToggleCalc: () => toggleGeoGebra(shadow),
      onOpenDesmos: () => openDesmos(),
    };
    renderCard(shadow, toCardVM(view, index, total), live, handlers);   // "Q n of N", never "Q n of n"
  }

  async function onCheck(view: QuestionView, pick: string): Promise<void> {
    const result = score(pick, view.correctAnswer ?? '');
    const live: LiveContent = { stem: view.stem, explanationGetter: () => view.explanation };
    if (result.graded && view.correctAnswer) {
      // mark the correct choice so renderVerdict can light it green even on a wrong pick
      const correctLetter = view.correctAnswer.trim().toUpperCase();
      shadow.querySelector(`.fp-choice[data-letter="${correctLetter}"]`)?.setAttribute('data-correct', 'true');
      await recordAttempt(db, makeAttempt({
        deviceId: dev, questionId: view.id, section: view.section, domain: view.domain,
        skill: view.skill, difficulty: view.difficulty, pick, correct: result.correct,
      }));
    }
    renderVerdict(shadow, { pick, result }, live);   // graded===false → non-verdict state (contract §2.4)
  }

  async function onNext(view: QuestionView): Promise<void> {
    index++;
    if (session) {
      session.lastQuestionId = view.id;
      session.updatedAt = nowIso();
      session.dirty = true;
      await saveSession(db, session);
    }
    // No auto-advance / prefetch: the next question appears only when the student navigates CB.
  }

  return shadow;
}

// Boot (only fires in the extension, not in unit tests which import runLoop directly).
if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
  void openStore().then((db) => runLoop(document, db, deviceId()));
}
```

- [ ] **Step 4: Run it; verify it passes**

Run: `cd extension && npx vitest run src/entrypoints/content.test.ts`
Expected: PASS (3 passed) — Start→Check records one correct attempt, writes a list session (seed 0), and the card header reads "Q 1 of 10" (N = the 10 loaded result rows, not "Q 1 of 1"); the unreadable-answer path records nothing and shows no verdict (never-guess); note saves and Next updates `lastQuestionId`.

- [ ] **Step 5: Commit**

```bash
git add extension/src/entrypoints/content.ts extension/src/entrypoints/content.test.ts
git commit -m "feat(extension): wire the user-gated scored loop (start/check/score/note/next/session)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Manifest — frame-src for GeoGebra (Open item O1)

If (and only if) a `content_security_policy` key is present, add `frame-src https://www.geogebra.org` so the integrated GeoGebra iframe can load (Decision D7). Plan 1's manifest has **no** CSP key today, so the legal/correct minimal change is to add a CSP that keeps the default-restrictive `script-src 'self'` while permitting the GeoGebra frame. **Nothing is added for Desmos** — it is `window.open` to its own site, not an embed.

> **Open item O1 (GeoGebra commercial-embed license):** verify GeoGebra's terms before launch. If they don't clear, drop the GeoGebra iframe + this `frame-src` and ship Desmos-only (`openDesmos()` is the always-legal, zero-license fallback). The codebase is already structured so removing GeoGebra is a one-file change (`calculator.ts`) plus this manifest line.

**Files:**
- Modify: `extension/manifest.json`
- Create: `extension/tests/manifest.test.ts`

- [ ] **Step 1: Write the failing test `extension/tests/manifest.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const manifest = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'manifest.json'), 'utf8'));

describe('manifest CSP', () => {
  it('allows the GeoGebra frame and no other host (D7)', () => {
    const csp = manifest.content_security_policy.extension_pages as string;
    expect(csp).toContain('frame-src https://www.geogebra.org');
    expect(csp).toContain("script-src 'self'");          // stays default-restrictive
  });

  it('adds NOTHING for Desmos (it is window.open, not an embed)', () => {
    expect(JSON.stringify(manifest)).not.toContain('desmos.com');
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `cd extension && npx vitest run tests/manifest.test.ts`
Expected: FAIL — `manifest.content_security_policy` is undefined (Plan 1 has no CSP key).

- [ ] **Step 3: Modify `extension/manifest.json`**

Add the `content_security_policy` key (after `host_permissions`):

```json
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'; frame-src https://www.geogebra.org"
  },
```

Resulting file:
```json
{
  "manifest_version": 3,
  "name": "Focused Practice (dev)",
  "version": "0.0.1",
  "description": "A study companion that adds scoring, a mistake journal, and a calculator on top of the official SAT question bank. Not affiliated with, authorized, or endorsed by College Board; SAT is a trademark of the College Board.",
  "permissions": ["storage"],
  "host_permissions": ["*://satsuiteeducatorquestionbank.collegeboard.org/*"],
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'; frame-src https://www.geogebra.org"
  },
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

- [ ] **Step 4: Run it; verify it passes**

Run: `cd extension && npx vitest run tests/manifest.test.ts`
Expected: PASS (2 passed) — GeoGebra frame allowed, default `script-src 'self'` preserved, no Desmos reference.

- [ ] **Step 5: Commit**

```bash
git add extension/manifest.json extension/tests/manifest.test.ts
git commit -m "feat(extension): allow GeoGebra frame in CSP; nothing for Desmos (D7, O1 noted)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Build, full typecheck, full suite green (integration gate)

No new behavior — prove the whole plan compiles, bundles, and every test (Plan 1 + Plan 2 + the CI legal guard) is green together.

**Files:**
- None (verification only).

- [ ] **Step 1: Build the extension**

Run: `cd extension && npm run build`
Expected: `Built extension to dist/` — `dist/content.js` now bundles the loop + UI (host, card, start-panel, calculator, order), `dist/background.js`, `dist/manifest.json` copied.

- [ ] **Step 2: Typecheck the whole project**

Run: `cd extension && npm run typecheck`
Expected: clean (no errors) — the new `ui/*`, `order.ts`, and rewired `content.ts` typecheck against Plan 1's frozen signatures.

- [ ] **Step 3: Run the full test suite**

Run: `cd extension && npm test`
Expected: ALL pass — smoke, model, guard, store, scoring, stats, merge, reader, observer, guard-ci (Plan 1) **plus** order, host, view-model, calculator, card, start-panel, content, manifest (Plan 2). The legal CI guard (`tests/guard-ci.test.ts`) still passes — no new file references `qbank-api` or fetches `collegeboard.org`.

- [ ] **Step 4: Commit (lockfile/incidental only if changed)**

```bash
git add -A extension
git commit -m "chore(extension): green build + full suite after scored-loop integration

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" || echo "nothing to commit"
```

---

## Self-review (completed during planning)

**Spec & contract coverage:**

| Spec / contract item | Implemented by |
|---|---|
| D2 — focus card over dimmed CB page (additive overlay) | Task 2 (single shadow host), Task 5 (`renderCard` trust badge + card) |
| D4 — explicit **Check** button + instant red/green | Task 5 (`fp-check`, `renderVerdict` red/green), Task 7 (`onCheck` → `score` → verdict) |
| D5 / O6 — reveal CB's **own** explanation in place, labelled unaltered, never AI | Task 5 (`fp-reveal` reads `explanationGetter()` live, "unaltered" label) |
| D7 — GeoGebra embed + Open-real-Desmos launcher | Task 4 (`toggleGeoGebra`/`openDesmos`), Task 8 (CSP `frame-src`) |
| D8 — Randomize within loaded results | Task 1 (`shuffleIds`/`newSeed`), Task 6 (`Randomize` button), Task 7 (`orderMode`/`shuffleSeed`) |
| §4 end-to-end loop (steps 3–5) | Task 6 (start panel), Task 7 (per-question loop, user-gated Next) |
| §7 focus card (trust badge, header, choices/cross-off, Check, reveal, note, Next, calc pin, progress) | Task 5 |
| §7 trust onboarding line | Task 6 (`.fp-onboarding`) |
| §8.4 Shadow DOM + TrustedHTML from day one | Task 2 (`TT_POLICY`/`html()`); all renders route through `html()` (Tasks 5, 6) |
| §8.6 question-type coverage: MC + grid-in; others → ungraded fallback | Task 3 (`kind`), Task 5 (grid-in input), Task 7 (`score` graded/false branch) |
| Contract §2.1 — `mountHost`/`HOST_ID`/`TT_POLICY` | Task 2 (created here) |
| Contract §2.2 — `shuffleIds`/`newSeed` | Task 1 (created here) |
| Contract §2.3 — session-resume protocol (Start writes session; Next updates `lastQuestionId`/`updatedAt`/`dirty`) | Task 7 |
| Contract §2.4 — never-guess: `readQuestion` null OR `graded===false` → reveal answer, no verdict, no attempt | Task 5 (`renderVerdict` non-verdict branch) + Task 7 (`onCheck` records only when `graded && correctAnswer`) |
| Contract §0 — stem/explanation RAM-only, never stored | Task 3 (`CardVM` excludes them; `LiveContent` carries them transiently), Task 7 (factories receive only IDs + own data) |
| O1 — GeoGebra license risk; Desmos always-legal fallback | Task 4 + Task 8 (noted; one-file removal path documented) |

**Deferred by contract (NOT done here, correctly):** the `isEnabled()` enablement gate (§2.5 — Plan 4 wraps the mount); the failure counter + degraded banner + DOM-contract self-check enriching the §2.4 state (Plan 4); the journal/progress panel, re-surface badger, and deep guided-resume order rebuild via `shuffleIds(currentListIds, seed)` (Plan 3). This plan mounts unconditionally and surfaces a plain Resume button only; it does not import or stub any Plan 3/4 symbol.

**Placeholder scan:** none. Every task shows real test code, the exact run command + expected outcome, real implementation code, and a real `git add`/`git commit`. Task 9 is an explicit integration gate (build + typecheck + full suite), not a placeholder. No "TBD/TODO/implement later/add error handling/similar to Task N".

**Type-consistency note (signatures match the contract):**
- Reused verbatim, never redefined: `readQuestion(root): QuestionView | null`, `observeQuestions(doc, onShown): () => void`, `score(pick, correctAnswerRaw): { graded, correct }`, `makeAttempt(NewAttempt): Attempt`, `makeNote({deviceId,questionId,text}): Note`, `makeSession({deviceId,filterContext,orderMode,shuffleSeed}): Session`, `openStore()`, `recordAttempt(db,a)`, `saveNote(db,n)`, `saveSession(db,s)`, `getSession(db,filterContext)`.
- Created exactly per contract: `mountHost(doc: Document): ShadowRoot`, `HOST_ID = 'focused-practice-root'`, `TT_POLICY = 'focused-practice'` (§2.1); `shuffleIds(ids: string[], seed: number): string[]`, `newSeed(): number` (§2.2).
- `filterContext` written as `"SAT|<section>|<domain>|<difficulty-or-Any>"` — matches the contract §2.3 `"SAT|Math|Algebra|<difficulty-or-Any>"` shape; `shuffleSeed === 0` for list, `newSeed()` for random; on Next the live session updates `lastQuestionId`/`updatedAt`/`dirty` then re-`saveSession`s (keyed by `filterContext`), exactly as §2.3 specifies and as Plan 3 reads.
- New local types (`CardVM`, `ChoiceVM`, `LiveContent`, `CardHandlers`, `Verdict`, `StartPanelState`, `StartPanelHandlers`) are plan-internal — not cross-boundary — and deliberately exclude stem/explanation from anything storable.
