# Answer-Area Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop re-rendering College Board's question; mount our interactive answer UI *inside* CB's `.answer-content` so CB renders the question and rationale natively while we render only the interaction.

**Architecture:** A new `answer-overlay` module mounts one shadow-isolated host as a child of CB's `.answer-content`, hides CB's native choices, and renders our choices/actions/verdict/note. On reveal it un-hides CB's own `.rationale`. The body-level host is kept only for the start panel and the floating calculator. The reader stops producing `stemHtml`/`explanationHtml` and the allowlist sanitizer is deleted.

**Tech Stack:** TypeScript, vitest + happy-dom, MV3 content script, Shadow DOM + TrustedTypes, the CDP dev-Chrome harness (`npm run dev:chrome` / `npm run reload` / `scripts/cdp-eval.mjs`) for live verification.

**Reference:** Design spec at `docs/specs/2026-06-17-answer-area-overlay-design.md`.

---

## File Structure

- `src/ui/answer-overlay.ts` — **new.** Mounts/refreshes our shadow host inside `.answer-content`; hides CB choices; renders our UI; reveals CB's rationale. One responsibility: the answer-area UI.
- `src/ui/answer-overlay.test.ts` — **new.** happy-dom tests for the above.
- `src/cb/reader.ts` — **modify.** Remove `stemHtml`/`explanationHtml`/`explanation` fields, `readStemHtml`, `readExplanationHtml`, and the sanitizer (`sanitizeInto`, `STEM_TAGS`, `DROP_TAGS`, `MATH_TAGS`, `KEEP_ATTRS`). Keep `stem` (observer dedup) + `correctAnswer` + taxonomy + `choices`.
- `src/cb/reader.test.ts` — **modify.** Drop the stemHtml/explanationHtml tests.
- `src/ui/view-model.ts` — **modify.** `LiveContent` is removed; `CardVM` and `toCardVM` keep their current fields (no stem/explanation in the VM already).
- `src/ui/card.ts` — **modify.** Keep `renderStartPanel` usage path untouched; remove the question-card render (`renderCard`) and the verdict/need-answer/stale helpers (they move to `answer-overlay.ts`). Keep `esc`/exported `Verdict` type if still referenced.
- `src/ui/host.ts` — **unchanged** (body-level host still serves the start panel + calculator extras slot; `html()`/TT policy shared).
- `src/entrypoints/content.ts` — **modify.** `showQuestion` mounts the answer overlay into the live modal's `.answer-content` instead of calling `renderCard`; handlers wire to the overlay; reveal calls `revealRationale`.
- `src/entrypoints/content.test.ts`, `src/ui/card.test.ts`, `src/ui/calculator.test.ts` — **modify.** Update to the new mount path / removed `LiveContent`.

---

## Task 1: Spike — validate CB's live answer-area behavior (no code committed)

**Files:** none (investigation only).

- [ ] **Step 1: Ensure the dev extension + Chrome are current**

Run:
```bash
cd extension && npm run build && npm run dev:chrome && npm run reload
```
Expected: `✓ dev Chrome up` and `✓ reloaded`.

- [ ] **Step 2: Open a real CB question and capture the answer-area DOM shape**

In the dev Chrome, open any question from the results list. Then run:
```bash
node scripts/cdp-eval.mjs "(() => {
  const modal=[...document.querySelectorAll('.cb-dialog-container')].find(e=>/Question ID:/i.test(e.textContent||''));
  const ac=modal?.querySelector('.answer-content');
  return JSON.stringify({
    hasAnswerContent: !!ac,
    directChildren: ac ? [...ac.children].map(c=>c.className) : null,
    hasChoices: !!ac?.querySelector('.answer-choices'),
    hasRationale: !!ac?.querySelector('.rationale')
  }, null, 2);
})()"
```
Record: the exact class of `.answer-content`'s direct children (so the mount inserts our host correctly and the hide-selectors match).

- [ ] **Step 3: Confirm the three risks**

1. **Re-render on Next:** mark `.answer-content` (`ac.dataset.spikeMark='1'`), click CB's in-modal "Next", then re-query — does `data-spike-mark` survive? Records whether CB replaces the node (→ we re-mount every emit, which the plan already does).
2. **Shadow isolation:** append a `<div>` with `attachShadow({mode:'open'})` inside `.answer-content`, write a styled element, confirm CB's CSS doesn't restyle it and ours doesn't leak.
3. **Click containment:** dispatch a real `pointerdown` on a node inside `.answer-content` and confirm the modal stays open.

- [ ] **Step 4: Decision gate**

If `.answer-content`/`.answer-choices`/`.rationale` selectors differ from this plan, update the selectors in Tasks 4–6 before implementing. If CB does NOT wipe `.answer-content` on Next, the idempotent re-mount still works (it reuses the existing host). No commit.

---

## Task 2: Remove the explanation render path from the reader

**Files:**
- Modify: `src/cb/reader.ts`
- Modify: `src/cb/reader.test.ts`

- [ ] **Step 1: Delete the explanation-HTML test**

In `src/cb/reader.test.ts`, delete the test `it('renders ... explanation ...')` (any test asserting `v.explanationHtml`). Keep the `correctAnswer` tests.

- [ ] **Step 2: Run the reader tests to confirm they still pass without that test**

Run: `cd extension && npx vitest run src/cb/reader.test.ts`
Expected: PASS (fewer tests).

- [ ] **Step 3: Remove `explanationHtml`/`explanation` from the reader**

In `src/cb/reader.ts`:
- Remove `explanationHtml: string;` and `explanation: string | null;` from the `QuestionView` interface.
- Remove `readExplanationHtml` (the whole function).
- In `readQuestion`'s returned object, delete the `explanation:` and `explanationHtml:` properties. Keep `correctAnswer` (still computed from `.rationale`).

- [ ] **Step 4: Add a reader test asserting the explanation fields are gone**

In `src/cb/reader.test.ts`, add:
```ts
it('no longer exposes explanation fields (CB renders its rationale natively)', () => {
  const v = readQuestion(load('multiple-choice.html'))! as Record<string, unknown>;
  expect(v.explanation).toBeUndefined();
  expect(v.explanationHtml).toBeUndefined();
  expect(v.correctAnswer).toBe('B');   // still read for scoring
});
```

- [ ] **Step 5: Run reader tests**

Run: `cd extension && npx vitest run src/cb/reader.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/cb/reader.ts src/cb/reader.test.ts
git commit -m "refactor(reader): drop explanation render path (CB renders its rationale natively)"
```

---

## Task 3: Remove the stem-HTML render path + the sanitizer

**Files:**
- Modify: `src/cb/reader.ts`
- Modify: `src/cb/reader.test.ts`

- [ ] **Step 1: Delete the stem-HTML tests**

In `src/cb/reader.test.ts`, delete the tests asserting `v.stemHtml` (table preserved / scripts stripped / math flattened / labels dropped). Keep the test `strips MathJax <style>/<script> noise out of the stem` (it asserts the plain `v.stem`, still used).

- [ ] **Step 2: Run reader tests to confirm they pass**

Run: `cd extension && npx vitest run src/cb/reader.test.ts`
Expected: PASS.

- [ ] **Step 3: Remove `stemHtml` + the sanitizer**

In `src/cb/reader.ts`:
- Remove `stemHtml: string;` from `QuestionView`.
- Remove `readStemHtml` (whole function).
- Remove the sanitizer block: `STEM_TAGS`, `DROP_TAGS`, `MATH_TAGS`, `KEEP_ATTRS`, and `sanitizeInto`.
- In `readQuestion`'s return, delete the `stemHtml:` property.
- Keep `stemRoot` and `readStem` (the plain-text stem feeds the observer's dedup signature).

- [ ] **Step 4: Add a reader test asserting stemHtml is gone but stem text remains**

In `src/cb/reader.test.ts`, add:
```ts
it('no longer exposes stemHtml, but still reads plain stem text (observer dedup needs it)', () => {
  const v = readQuestion(load('multiple-choice.html'))! as Record<string, unknown>;
  expect(v.stemHtml).toBeUndefined();
  expect(typeof v.stem).toBe('string');
  expect((v.stem as string).length).toBeGreaterThan(0);
});
```

- [ ] **Step 5: Run reader tests + full suite (reader is widely imported)**

Run: `cd extension && npx vitest run src/cb/reader.test.ts && npx tsc --noEmit`
Expected: reader tests PASS; **typecheck will FAIL** in files still referencing `stemHtml`/`explanationHtml` (`view-model.ts`, `card.ts`, `content.ts`, their tests). That is expected — Tasks 4–9 fix those. Do not "fix" by re-adding fields.

- [ ] **Step 6: Commit**

```bash
git add src/cb/reader.ts src/cb/reader.test.ts
git commit -m "refactor(reader): drop stemHtml + allowlist sanitizer (CB renders the stem natively)"
```

---

## Task 4: Create `answer-overlay` — mount a host in `.answer-content` and hide CB's choices

**Files:**
- Create: `src/ui/answer-overlay.ts`
- Create: `src/ui/answer-overlay.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/ui/answer-overlay.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mountAnswerOverlay, findAnswerContent } from './answer-overlay';
import type { CardVM } from './view-model';

const vm: CardVM = {
  id: 'ab12cd34', section: 'Math', domain: 'Algebra', skill: 'Linear', difficulty: 'Hard',
  kind: 'mc', choices: [{ letter: 'A', text: '3' }, { letter: 'B', text: '5' }],
  answerKnown: true, position: { index: 1, total: 10 },
};
const noop = () => ({
  onSelect(){}, onEliminate(){}, onCheck(){}, onReveal(){}, onNext(){},
  onToggleCalc(){}, onOpenDesmos(){}, onClose(){},
});

beforeEach(() => { document.body.innerHTML = ''; });

function cbAnswerContent(): HTMLElement {
  document.body.innerHTML =
    '<div class="cb-dialog-container"><div class="answer-content">' +
    '<div class="answer-choices"><ul><li>3</li><li>5</li></ul></div>' +
    '<div class="rationale"><p>Correct Answer: B</p></div>' +
    '</div></div>';
  return findAnswerContent(document.querySelector('.cb-dialog-container')!)!;
}

describe('mountAnswerOverlay', () => {
  it('mounts a shadow host inside .answer-content and hides CB\'s native choices', () => {
    const ac = cbAnswerContent();
    const shadow = mountAnswerOverlay(ac, vm, noop());
    expect(ac.querySelector('.fp-answer-host')!.shadowRoot).toBe(shadow);
    expect((ac.querySelector('.answer-choices') as HTMLElement).style.display).toBe('none');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd extension && npx vitest run src/ui/answer-overlay.test.ts`
Expected: FAIL — `mountAnswerOverlay`/`findAnswerContent` not defined.

- [ ] **Step 3: Write the minimal implementation**

Create `src/ui/answer-overlay.ts`:
```ts
import { html } from './host';
import type { CardVM } from './view-model';

export interface AnswerHandlers {
  onSelect(letter: string): void; onEliminate(letter: string): void;
  onCheck(pick: string): void; onReveal(): void; onNext(): void;
  onToggleCalc(): void; onOpenDesmos(): void; onClose(): void;
}

const HOST_CLASS = 'fp-answer-host';

// CB's answer container (choices + rationale) inside the question modal.
export function findAnswerContent(modal: Element): HTMLElement | null {
  return modal.querySelector('.answer-content');
}

// Mount (or reuse) our shadow host as the FIRST child of CB's .answer-content, hiding CB's own
// choices + rationale. Idempotent: CB may replace .answer-content on its in-place "Next", so this is
// called on every question emit and reuses an existing host when present.
export function mountAnswerOverlay(answerContent: HTMLElement, vm: CardVM, h: AnswerHandlers): ShadowRoot {
  answerContent.querySelectorAll(':scope > .answer-choices, :scope > .rationale')
    .forEach((el) => { (el as HTMLElement).style.display = 'none'; });

  let host = answerContent.querySelector(`:scope > .${HOST_CLASS}`) as HTMLElement | null;
  if (!host) {
    const doc = answerContent.ownerDocument!;
    host = doc.createElement('div');
    host.className = HOST_CLASS;
    // CB closes its modal on outside pointer-down; stop our events at the host (belt-and-suspenders —
    // we are inside the modal, but keep parity with the old body host).
    for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'] as const) {
      host.addEventListener(t, (e) => e.stopPropagation());
    }
    answerContent.insertBefore(host, answerContent.firstChild);
    host.attachShadow({ mode: 'open' });
  }
  const shadow = host.shadowRoot!;
  shadow.innerHTML = html(`<style>${ANSWER_CSS}</style><div class="fp-answer"></div>`) as unknown as string;
  void vm; void h;   // wired in Task 5
  return shadow;
}

const ANSWER_CSS = `
.fp-answer{font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#1f2937;}
`;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd extension && npx vitest run src/ui/answer-overlay.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/answer-overlay.ts src/ui/answer-overlay.test.ts
git commit -m "feat(answer-overlay): mount shadow host in CB's .answer-content, hide native choices"
```

---

## Task 5: Render the interactive answer UI (choices, actions, verdict, note)

**Files:**
- Modify: `src/ui/answer-overlay.ts`
- Modify: `src/ui/answer-overlay.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/ui/answer-overlay.test.ts`:
```ts
it('renders the trust badge, A–D choices, controls, and fires handlers', () => {
  const ac = cbAnswerContent();
  let picked = ''; let checked = '';
  const shadow = mountAnswerOverlay(ac, vm, { ...noop(),
    onSelect: (l) => { picked = l; }, onCheck: (p) => { checked = p; } });
  expect(shadow.querySelector('.fp-trust')!.textContent).toContain('unaltered');
  expect(shadow.querySelectorAll('.fp-choice')).toHaveLength(2);
  expect(shadow.querySelector('.fp-progress')!.textContent).toContain('Q 1 of 10');
  (shadow.querySelector('.fp-choice[data-letter="B"] .fp-pick') as HTMLElement).click();
  expect(picked).toBe('B');
  (shadow.querySelector('.fp-check') as HTMLElement).click();
  expect(checked).toBe('B');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd extension && npx vitest run src/ui/answer-overlay.test.ts`
Expected: FAIL — no `.fp-trust`/`.fp-choice`/`.fp-check` rendered.

- [ ] **Step 3: Implement the body render + wiring**

In `src/ui/answer-overlay.ts`, replace the `shadow.innerHTML = ...; void vm; void h;` line with a real render. Add an `esc` helper and a `renderBody(vm)` builder, then wire events:
```ts
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function renderBody(vm: CardVM): string {
  const answerBody = vm.kind === 'mc'
    ? `<ul class="fp-choices">${vm.choices.map((c) => `
        <li class="fp-choice" data-letter="${esc(c.letter)}">
          <button class="fp-eliminate" aria-label="Cross off ${esc(c.letter)}">⊘</button>
          <button class="fp-pick"><span class="fp-letter">${esc(c.letter)}</span> ${esc(c.text)}</button>
        </li>`).join('')}</ul>`
    : `<label class="fp-gridin-label">Your answer
         <input class="fp-gridin" type="text" inputmode="text" autocomplete="off" /></label>`;
  return `<div class="fp-answer">
    <div class="fp-answer-head">
      <div class="fp-trust">Real College Board question · live, unaltered</div>
      <button class="fp-overlay-close" aria-label="Close">✕</button>
    </div>
    <div class="fp-progress">${esc(vm.skill)} › ${esc(vm.difficulty)} · Q ${vm.position.index} of ${vm.position.total}</div>
    ${answerBody}
    <div class="fp-actions">
      <button class="fp-check">Check</button>
      <button class="fp-reveal">Reveal explanation</button>
      <button class="fp-next">Next</button>
    </div>
    <div class="fp-verdict" aria-live="polite"></div>
    <label class="fp-note-label">Why did you miss it?
      <textarea class="fp-note" rows="1" placeholder="one line — your own note"></textarea>
    </label>
    <div class="fp-calc">
      <button class="fp-calc-pin">Calculator</button>
      <button class="fp-desmos">Open real Desmos</button>
    </div>
  </div>`;
}

function wire(shadow: ShadowRoot, vm: CardVM, h: AnswerHandlers): void {
  let pick: string | null = null;
  const pickValue = () => vm.kind === 'grid'
    ? (shadow.querySelector('.fp-gridin') as HTMLInputElement)?.value.trim() ?? ''
    : pick ?? '';
  shadow.querySelectorAll('.fp-choice').forEach((li) => {
    const letter = (li as HTMLElement).dataset.letter!;
    li.querySelector('.fp-pick')!.addEventListener('click', () => {
      pick = letter;
      shadow.querySelectorAll('.fp-choice').forEach((x) => x.classList.remove('fp-selected'));
      li.classList.add('fp-selected');
      h.onSelect(letter);
    });
    li.querySelector('.fp-eliminate')!.addEventListener('click', () => {
      li.classList.toggle('fp-eliminated'); h.onEliminate(letter);
    });
  });
  shadow.querySelector('.fp-overlay-close')!.addEventListener('click', () => h.onClose());
  shadow.querySelector('.fp-check')!.addEventListener('click', () => h.onCheck(pickValue()));
  shadow.querySelector('.fp-reveal')!.addEventListener('click', () => h.onReveal());
  shadow.querySelector('.fp-next')!.addEventListener('click', () => h.onNext());
  shadow.querySelector('.fp-note')!.addEventListener('change', () => {});
  shadow.querySelector('.fp-calc-pin')!.addEventListener('click', () => h.onToggleCalc());
  shadow.querySelector('.fp-desmos')!.addEventListener('click', () => h.onOpenDesmos());
}
```
Then in `mountAnswerOverlay`, set `shadow.innerHTML = html(`<style>${ANSWER_CSS}</style>` + renderBody(vm)) as unknown as string;` and call `wire(shadow, vm, h);` before `return shadow;`. Expand `ANSWER_CSS` with the `.fp-trust`/`.fp-choice`/`.fp-check`/`.fp-progress`/`.fp-note` rules copied from `host.ts`'s `BASE_CSS` (same class names).

- [ ] **Step 4: Run to verify it passes**

Run: `cd extension && npx vitest run src/ui/answer-overlay.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/answer-overlay.ts src/ui/answer-overlay.test.ts
git commit -m "feat(answer-overlay): render interactive choices, actions, verdict slot, note"
```

---

## Task 6: Verdict + reveal CB's native rationale

**Files:**
- Modify: `src/ui/answer-overlay.ts`
- Modify: `src/ui/answer-overlay.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/ui/answer-overlay.test.ts`:
```ts
import { renderVerdict, revealRationale } from './answer-overlay';
import { score } from '../scoring';

it('revealRationale un-hides CB\'s native .rationale', () => {
  const ac = cbAnswerContent();
  mountAnswerOverlay(ac, vm, noop());
  expect((ac.querySelector('.rationale') as HTMLElement).style.display).toBe('none');
  const ok = revealRationale(ac);
  expect(ok).toBe(true);
  expect((ac.querySelector('.rationale') as HTMLElement).style.display).toBe('');
});

it('renderVerdict lights the correct choice green and the wrong pick red', () => {
  const ac = cbAnswerContent();
  const shadow = mountAnswerOverlay(ac, vm, noop());
  shadow.querySelector('.fp-choice[data-letter="B"]')!.setAttribute('data-correct', 'true');
  renderVerdict(shadow, { pick: 'A', result: score('A', 'B') });
  expect(shadow.querySelector('.fp-choice[data-letter="A"]')!.classList.contains('fp-wrong')).toBe(true);
  expect(shadow.querySelector('.fp-choice[data-letter="B"]')!.classList.contains('fp-correct')).toBe(true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd extension && npx vitest run src/ui/answer-overlay.test.ts`
Expected: FAIL — `renderVerdict`/`revealRationale` not exported.

- [ ] **Step 3: Implement reveal + verdict**

Add to `src/ui/answer-overlay.ts`:
```ts
import type { ScoreResult } from '../scoring';

export interface Verdict { pick: string; result: ScoreResult; }

// Un-hide CB's own rationale (hidden on mount). Returns false if CB hasn't injected it.
export function revealRationale(answerContent: HTMLElement): boolean {
  const r = answerContent.querySelector(':scope > .rationale') as HTMLElement | null;
  if (!r) return false;
  r.style.display = '';
  return true;
}

export function renderVerdict(shadow: ShadowRoot, v: Verdict): void {
  const verdict = shadow.querySelector('.fp-verdict') as HTMLElement;
  if (!v.result.graded) {
    verdict.innerHTML = html(`<div class="fp-indeterminate">Couldn't grade this one — see College Board's answer below.</div>`) as unknown as string;
    return;
  }
  shadow.querySelectorAll('.fp-choice').forEach((li) => {
    const letter = (li as HTMLElement).dataset.letter!;
    if (letter === v.pick && !v.result.correct) li.classList.add('fp-wrong');
    if ((li as HTMLElement).dataset.correct === 'true') li.classList.add('fp-correct');
  });
  verdict.innerHTML = html(v.result.correct
    ? `<span class="fp-ok">Correct</span>` : `<span class="fp-no">Not quite</span>`) as unknown as string;
}

export function renderNeedAnswer(shadow: ShadowRoot, kind: 'mc' | 'grid'): void {
  (shadow.querySelector('.fp-verdict') as HTMLElement).innerHTML = html(
    `<div class="fp-need-answer">${kind === 'grid' ? 'Enter your answer first.' : 'Select an answer first.'}</div>`) as unknown as string;
}
```
Add the `.fp-verdict`/`.fp-ok`/`.fp-no`/`.fp-correct`/`.fp-wrong`/`.fp-indeterminate`/`.fp-need-answer` rules to `ANSWER_CSS` (copy from `host.ts` `BASE_CSS`).

- [ ] **Step 4: Run to verify it passes**

Run: `cd extension && npx vitest run src/ui/answer-overlay.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/answer-overlay.ts src/ui/answer-overlay.test.ts
git commit -m "feat(answer-overlay): verdict rendering + reveal CB's native rationale"
```

---

## Task 7: Idempotent re-mount + graceful no-op

**Files:**
- Modify: `src/ui/answer-overlay.test.ts` (behavior already implemented in Task 4; this locks it with tests)

- [ ] **Step 1: Write the failing tests**

Add to `src/ui/answer-overlay.test.ts`:
```ts
it('re-mounting reuses the single host (no duplicate overlays)', () => {
  const ac = cbAnswerContent();
  mountAnswerOverlay(ac, vm, noop());
  mountAnswerOverlay(ac, vm, noop());
  expect(ac.querySelectorAll('.fp-answer-host')).toHaveLength(1);
});

it('findAnswerContent returns null when CB has no .answer-content (overlay no-ops)', () => {
  document.body.innerHTML = '<div class="cb-dialog-container"><div class="cb-dialog-header"></div></div>';
  expect(findAnswerContent(document.querySelector('.cb-dialog-container')!)).toBeNull();
});
```

- [ ] **Step 2: Run to verify it fails or passes**

Run: `cd extension && npx vitest run src/ui/answer-overlay.test.ts`
Expected: PASS (the reuse + null-find were built in Task 4). If the reuse test FAILS (two hosts), fix `mountAnswerOverlay` to reuse `:scope > .${HOST_CLASS}` before creating — then re-run.

- [ ] **Step 3: Commit**

```bash
git add src/ui/answer-overlay.test.ts
git commit -m "test(answer-overlay): lock idempotent re-mount + graceful no-op"
```

---

## Task 8: Remove `LiveContent` and the question-card render from `card.ts`/`view-model.ts`

**Files:**
- Modify: `src/ui/view-model.ts`
- Modify: `src/ui/card.ts`
- Modify: `src/ui/card.test.ts`
- Modify: `src/ui/calculator.test.ts`

- [ ] **Step 1: Update the tests first (they define the new surface)**

In `src/ui/card.test.ts`: delete the `renderCard`/`renderVerdict`/`live` tests that depend on the question card and `LiveContent`. Keep only tests for anything `card.ts` still exports (e.g. `renderStartPanel` if it lives here — otherwise this file may be deleted). In `src/ui/calculator.test.ts`: remove the `import { renderCard }` / `LiveContent` usage and the "survives a card re-render" test's dependency on `renderCard` (replace with `mountAnswerOverlay` if a render-survival check is still wanted, else drop it — the calculator lives in the body host, unaffected).

- [ ] **Step 2: Run those tests to verify they fail to compile/find symbols**

Run: `cd extension && npx vitest run src/ui/card.test.ts src/ui/calculator.test.ts`
Expected: FAIL (symbols still referenced) until Step 3.

- [ ] **Step 3: Remove `LiveContent` and the card render**

- In `src/ui/view-model.ts`: delete the `LiveContent` interface entirely. Leave `CardVM`/`ChoiceVM`/`toCardVM` unchanged.
- In `src/ui/card.ts`: delete `renderCard`, `renderVerdict`, `renderNeedAnswer`, `renderStaleCard`, the `LiveContent` import, and the `Verdict`/`CardHandlers` types (now owned by `answer-overlay.ts`). Keep `renderStartPanel` and `esc` if the start panel still uses them. If nothing remains in `card.ts`, delete the file and its test.

- [ ] **Step 4: Run the tests**

Run: `cd extension && npx vitest run src/ui/card.test.ts src/ui/calculator.test.ts`
Expected: PASS (or the files are removed).

- [ ] **Step 5: Commit**

```bash
git add src/ui/view-model.ts src/ui/card.ts src/ui/card.test.ts src/ui/calculator.test.ts
git commit -m "refactor(ui): drop LiveContent + the centered question-card render"
```

---

## Task 9: Wire `content.ts` to mount the overlay into the live modal

**Files:**
- Modify: `src/entrypoints/content.ts`
- Modify: `src/entrypoints/content.test.ts`

- [ ] **Step 1: Write/adjust the failing test**

In `src/entrypoints/content.test.ts`, update the question-render test to assert the overlay mounts into `.answer-content` of the live modal fixture (instead of a centered `.fp-card`). Example assertion after a question is shown:
```ts
const ac = document.querySelector('.cb-dialog-container .answer-content')!;
expect(ac.querySelector('.fp-answer-host')!.shadowRoot!.querySelector('.fp-choice')).not.toBeNull();
```
Remove assertions about `LiveContent`/`stemHtml`/centered card. Keep the scoring, empty-answer, stale-card, and reveal-polling tests (adapt their selectors to read the verdict from `.fp-answer-host`'s shadow).

- [ ] **Step 2: Run to verify it fails**

Run: `cd extension && npx vitest run src/entrypoints/content.test.ts`
Expected: FAIL — overlay not mounted / symbols changed.

- [ ] **Step 3: Implement the wiring**

In `src/entrypoints/content.ts`:
- Replace the `import { renderCard, renderVerdict, renderNeedAnswer, renderStaleCard } from '../ui/card'` and `LiveContent` import with `import { findAnswerContent, mountAnswerOverlay, renderVerdict, renderNeedAnswer, revealRationale, type AnswerHandlers } from '../ui/answer-overlay'`.
- Delete `currentExplanationHtml` and the `live` objects (no `LiveContent` anymore).
- In `showQuestion(view)`: locate the live modal and its `.answer-content`; if absent, return (no-op). Build the `CardVM` via `toCardVM(view, index, total)`, mount the overlay, and keep the existing reveal trigger:
```ts
function showQuestion(view: QuestionView): void {
  checked = false;
  total = Math.max(total, countLoadedResults(doc), index + 1);
  ensureAnswerRevealed(doc);
  const modal = currentModal(doc, view.id);            // existing helper that finds the modal by id
  const answerContent = modal ? findAnswerContent(modal) : null;
  if (!answerContent) return;                           // graceful no-op (spec §Resilience)
  const handlers: AnswerHandlers = {
    onSelect: () => {}, onEliminate: () => {},
    onCheck: (pick) => onCheck(view, pick),
    onReveal: () => { revealRationale(answerContent); },
    onNext: () => onNext(view),
    onToggleCalc: () => toggleGeoGebra(shadow),         // body host shadow, unchanged
    onOpenDesmos: () => openDesmos(),
    onClose: () => { answerContent.querySelector('.fp-answer-host')?.remove(); },
  };
  void handleQuestion(answerContent, view, () =>
    mountAnswerOverlay(answerContent, toCardVM(view, index, total), handlers));
}
```
- In `onCheck`: replace `renderNeedAnswer(shadow, …)`/`renderStaleCard(shadow)`/`renderVerdict(shadow, …, live)` with the answer-overlay equivalents targeting the overlay's shadow. Get the shadow via `answerContentFor(view).querySelector('.fp-answer-host')!.shadowRoot!`. Set the correct-choice hook on that shadow (`shadow.querySelector('.fp-choice[data-letter="X"]')?.setAttribute('data-correct','true')`) before `renderVerdict(shadow, { pick, result })`.
- If `handleQuestion` previously took `(shadow, view, render)`, change its contract to `(answerContent, view, render)` or inline its §2.4 contract check against `view` (it no longer needs the shadow). Keep its behavior: only render when the DOM contract holds.

Add the small helper if not present:
```ts
function currentModal(doc: Document, id: string): Element | null {
  return [...doc.querySelectorAll('.cb-dialog-container')]
    .find((el) => new RegExp(`Question ID:\\s*${id}`, 'i').test(el.textContent ?? '')) ?? null;
}
```

- [ ] **Step 4: Run the content tests**

Run: `cd extension && npx vitest run src/entrypoints/content.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/entrypoints/content.ts src/entrypoints/content.test.ts
git commit -m "feat(content): mount the answer overlay into CB's .answer-content; reveal native rationale"
```

---

## Task 10: Full green + typecheck + build

**Files:** none (verification).

- [ ] **Step 1: Run the whole suite + typecheck + build**

Run:
```bash
cd extension && npx vitest run && npx tsc --noEmit && npm run build
```
Expected: all tests PASS, `tsc` exits 0, `Built chrome extension to dist/`. Fix any remaining references to removed symbols (`stemHtml`, `explanationHtml`, `LiveContent`, `renderCard`) until green.

- [ ] **Step 2: Commit any cleanup**

```bash
git add -A && git commit -m "chore: green after answer-overlay refactor"
```

---

## Task 11: Live verification in Chrome for Testing

**Files:** none (verification).

- [ ] **Step 1: Reload and drive a real question**

Run: `cd extension && npm run reload`. Open a real CB question in the dev Chrome and confirm:
- CB's question (left/top) renders natively; our overlay sits over the answer area.
- Choices select/cross-off; **Check** lights red/green; **Reveal** shows CB's own rationale; **Next** advances.
- Resize the window narrow → the overlay follows CB's stacked layout.
- Capture a screenshot via the CDP harness (`Page.captureScreenshot`) for the record.

- [ ] **Step 2: Confirm no console/navigation errors**

Use the CDP Log-capture pattern to confirm zero errors while checking/revealing/advancing.

- [ ] **Step 3: Final commit (if any tweaks)**

```bash
git add -A && git commit -m "fix(answer-overlay): live CfT polish"
```

---

## Self-Review

- **Spec coverage:** stem CB-native (Task 3) ✓; choices ours + hide CB's (Tasks 4–5) ✓; reveal CB rationale (Task 6) ✓; remove card/sanitizer/explanationHtml (Tasks 2, 3, 8) ✓; inject-into-`.answer-content` (Task 4) ✓; resilience no-op + idempotent re-mount (Tasks 7, 9) ✓; isolation + click containment (Task 4 host + Task 1 spike) ✓; testing (every task) + live (Task 11) ✓; spike first (Task 1) ✓.
- **Placeholders:** none — code shown for each code step; selectors confirmed in Task 1.
- **Type consistency:** `AnswerHandlers`, `Verdict`, `mountAnswerOverlay`, `renderVerdict`, `renderNeedAnswer`, `revealRationale`, `findAnswerContent` are defined in `answer-overlay.ts` (Tasks 4–6) and consumed consistently in `content.ts` (Task 9). `CardVM`/`toCardVM` unchanged. Open follow-up: confirm the existing `handleQuestion` signature during Task 9 and adapt as noted.
