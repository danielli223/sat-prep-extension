import { html } from './host';
import type { CardVM, ChoiceVM } from './view-model';
import type { ScoreResult } from '../scoring';

export interface AnswerHandlers {
  onSelect(letter: string): void; onEliminate(letter: string): void;
  onCheck(pick: string): void; onReveal(): void; onNext(): void;
  onToggleCalc(): void; onOpenDesmos(): void; onClose(): void;
  onNote(text: string): void;
}

const HOST_CLASS = 'fp-answer-host';
// Marker on the CB-native nodes WE hid, so teardown restores exactly those (and never un-hides a node
// CB itself had hidden). Also lets the MutationObserver and revealRationale find our own work.
const HIDDEN_ATTR = 'data-fp-hidden';

// One MutationObserver per .answer-content, keyed by the container so re-mount can disconnect the
// previous one (no stacked observers across CB's in-place re-renders). WeakMap → GC'd with the node.
const hideObservers = new WeakMap<Element, MutationObserver>();

// CB's answer container (choices + rationale) inside the question modal.
export function findAnswerContent(modal: Element): HTMLElement | null {
  return modal.querySelector('.answer-content');
}

// Hide ONE CB-native direct child (display:none) and mark it as ours so teardown can restore it.
// Idempotent: re-hiding a node we already marked is a no-op.
function hideCbNode(el: HTMLElement): void {
  if (el.classList.contains(HOST_CLASS)) return;   // never touch our own host
  if (el.hasAttribute(HIDDEN_ATTR)) return;
  el.setAttribute(HIDDEN_ATTR, '');
  el.style.display = 'none';
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function choiceBody(c: ChoiceVM): string {
  if (c.imgSrc) {
    return `<img src="${esc(c.imgSrc)}" alt="${esc(c.text || c.letter)}" class="fp-choice-img" />`;
  }
  return esc(c.text);
}

function renderBody(vm: CardVM): string {
  const answerBody = vm.kind === 'mc'
    ? `<ul class="fp-choices">${vm.choices.map((c) => `
        <li class="fp-choice" data-letter="${esc(c.letter)}">
          <button class="fp-eliminate" aria-label="Cross off ${esc(c.letter)}">⊘</button>
          <button class="fp-pick"><span class="fp-letter">${esc(c.letter)}</span> ${choiceBody(c)}</button>
        </li>`).join('')}</ul>`
    : `<label class="fp-gridin-label">Your answer
         <input class="fp-gridin" type="text" inputmode="text" autocomplete="off" /></label>`;
  return `<div class="fp-answer">
    <div class="fp-answer-head">
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
  shadow.querySelector('.fp-note')!.addEventListener('change', (e) =>
    h.onNote((e.target as HTMLTextAreaElement).value.trim()));
  shadow.querySelector('.fp-calc-pin')!.addEventListener('click', () => h.onToggleCalc());
  shadow.querySelector('.fp-desmos')!.addEventListener('click', () => h.onOpenDesmos());
}

// Mount (or reuse) our shadow host as the FIRST child of CB's .answer-content, masking CB's own
// content. Idempotent: CB may replace .answer-content on its in-place "Next", so this is called on
// every question emit and reuses an existing host when present.
//
// Masking is whitelist-based, not blacklist-based: we hide EVERY direct child that isn't our host
// (so a future CB class rename can't leak content), and we install a MutationObserver to hide any
// node CB injects LATER — critically CB's `.rationale`, which the reveal drives in asynchronously
// (~150ms) and so does NOT exist at mount time. revealRationale is the sole un-hider.
export function mountAnswerOverlay(answerContent: HTMLElement, vm: CardVM, h: AnswerHandlers): ShadowRoot {
  // Reuse an existing direct-child host (idempotent re-mount). :scope > is unsupported in happy-dom,
  // so scan children directly.
  let host = Array.from(answerContent.children)
    .find((c) => c.classList.contains(HOST_CLASS)) as HTMLElement | undefined ?? null;
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

  // Catch async-injected nodes (M1): CB injects .rationale after mount. Hide any NEW non-host direct
  // child the same way. Disconnect a prior observer first so re-mounts don't stack observers.
  //
  // ORDER MATTERS — install the observer BEFORE the synchronous sweep below, then sweep current
  // children. This is gap-free across re-mounts: on CB's in-place re-render we disconnect the old
  // observer and immediately install a fresh one, then sweep. A node injected between the old
  // observer's disconnect and the new one's observe() would escape the observer — but the post-observe
  // sweep hides any such already-present node. Conversely, anything injected after the sweep is caught
  // by the now-active observer. No window is left where a CB node can stay visible. (Without this
  // ordering, the async .rationale injection that lands at ~the same time as the debounced re-mount
  // intermittently leaked through the disconnect gap — live-race flake.)
  hideObservers.get(answerContent)?.disconnect();
  const observer = new MutationObserver((records) => {
    for (const rec of records) {
      for (const node of Array.from(rec.addedNodes)) {
        // childList (non-subtree) only reports direct children; guard is belt-and-suspenders — do NOT add subtree:true (would hide CB's nested nodes)
        if (node.nodeType === 1 && (node as Element).parentElement === answerContent) {
          hideCbNode(node as HTMLElement);
        }
      }
    }
  });
  observer.observe(answerContent, { childList: true });
  hideObservers.set(answerContent, observer);

  // Whitelist hide: every direct child that ISN'T our host (covers .answer-choices + any present
  // .rationale + anything else CB rendered). :scope > is unsupported in happy-dom, so scan children.
  for (const el of Array.from(answerContent.children)) hideCbNode(el as HTMLElement);

  const shadow = host.shadowRoot!;
  shadow.innerHTML = html(`<style>${ANSWER_CSS}</style>` + renderBody(vm)) as unknown as string;
  wire(shadow, vm, h);
  return shadow;
}

// Teardown: restore CB's native content and remove our overlay. Used by onClose / last-question Next.
// Without this, removing only our host leaves CB's masked nodes stuck at display:none (a blank CB
// question). Disconnects the observer, un-hides exactly the nodes WE marked, and removes the host.
export function unmountAnswerOverlay(answerContent: HTMLElement): void {
  hideObservers.get(answerContent)?.disconnect();
  hideObservers.delete(answerContent);
  for (const el of Array.from(answerContent.querySelectorAll<HTMLElement>(`[${HIDDEN_ATTR}]`))) {
    el.style.display = '';
    el.removeAttribute(HIDDEN_ATTR);
  }
  answerContent.querySelector('.fp-answer-host')?.remove();
}

export interface Verdict { pick: string; result: ScoreResult; }

// The SOLE un-hider of CB's own rationale (hidden on mount, or by the observer if injected later).
// Returns false if CB hasn't injected it. Because it un-hides an EXISTING node (clears display +
// our marker) rather than inserting one, the childList MutationObserver does not re-hide it.
// NOTE: use a direct-children scan, NOT querySelector(':scope > .rationale') — happy-dom does not
// support :scope > (the hide loop in mountAnswerOverlay uses the same .children pattern).
export function revealRationale(answerContent: HTMLElement): boolean {
  const r = Array.from(answerContent.children)
    .find((c) => c.classList.contains('rationale')) as HTMLElement | undefined;
  if (!r) return false;
  r.style.display = '';
  r.removeAttribute(HIDDEN_ATTR);
  return true;
}

// Issue #27: once a Check resolves, the Check button has done its job — hide it (the house hide
// idiom, matching hideCbNode) and relabel the EXISTING reveal control to "Explain". We keep the
// .fp-reveal class and its onReveal→revealRationale wiring untouched, so "Explain" only ever un-hides
// CB's OWN native rationale (bright-line invariant #3 — never synthesize). Idempotent: re-running on
// the same shadow just re-applies display:none and the same label.
function morphCheckToExplain(shadow: ShadowRoot): void {
  (shadow.querySelector('.fp-check') as HTMLElement).style.display = 'none';
  const reveal = shadow.querySelector('.fp-reveal') as HTMLElement;
  reveal.textContent = 'Explain';
  reveal.classList.add('fp-explain');
}

export function renderVerdict(shadow: ShadowRoot, v: Verdict): void {
  const verdict = shadow.querySelector('.fp-verdict') as HTMLElement;
  if (!v.result.graded) {
    verdict.innerHTML = html(`<div class="fp-indeterminate">Couldn't grade this one — see College Board's answer below.</div>`) as unknown as string;
    morphCheckToExplain(shadow);
    return;
  }
  shadow.querySelectorAll('.fp-choice').forEach((li) => {
    const letter = (li as HTMLElement).dataset.letter!;
    if (letter === v.pick && !v.result.correct) li.classList.add('fp-wrong');
    if ((li as HTMLElement).dataset.correct === 'true') li.classList.add('fp-correct');
  });
  verdict.innerHTML = html(v.result.correct
    ? `<span class="fp-ok">Correct</span>` : `<span class="fp-no">Not quite</span>`) as unknown as string;
  morphCheckToExplain(shadow);
}

export function renderNeedAnswer(shadow: ShadowRoot, kind: 'mc' | 'grid'): void {
  (shadow.querySelector('.fp-verdict') as HTMLElement).innerHTML = html(
    `<div class="fp-need-answer">${kind === 'grid' ? 'Enter your answer first.' : 'Select an answer first.'}</div>`) as unknown as string;
}

// Stale-card guard message (carried over from the deleted card.ts). Shown when the overlay's kind
// (MC vs grid-in) disagrees with CB's revealed answer format — an out-of-sync question after CB's
// in-place swap. Refuse to grade rather than score against the wrong question.
export function renderStaleCard(shadow: ShadowRoot): void {
  (shadow.querySelector('.fp-verdict') as HTMLElement).innerHTML = html(
    `<div class="fp-stale">This question is out of sync with College Board — reopen it from the list to grade.</div>`) as unknown as string;
}

const ANSWER_CSS = `
.fp-answer{font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#1f2937;}
.fp-answer-head{display:flex;justify-content:flex-end;align-items:center;}
.fp-overlay-close{flex:none;border:none;background:#f1f5f9;color:#475569;border-radius:8px;width:30px;height:30px;cursor:pointer;font-size:13px;line-height:1;}
.fp-progress{display:flex;justify-content:space-between;gap:8px;font-size:11px;color:#6b7280;
  border-bottom:1px solid #eee;padding-bottom:8px;margin-bottom:12px;}
.fp-choices{list-style:none;margin:0 0 12px;padding:0;}
.fp-choice{display:flex;align-items:center;border:1px solid #e5e7eb;border-radius:9px;margin-bottom:7px;}
.fp-choice .fp-eliminate{border:none;background:transparent;color:#9ca3af;cursor:pointer;font-size:14px;padding:8px 4px 8px 10px;}
.fp-choice .fp-pick{flex:1;display:flex;align-items:center;text-align:left;border:none;background:transparent;
  cursor:pointer;padding:9px 12px 9px 2px;color:inherit;font:inherit;}
.fp-choice .fp-letter{font-weight:700;margin-right:8px;}
.fp-choice-img{max-height:2.5em;width:auto;vertical-align:middle;}
.fp-choice.fp-selected{border:2px solid #3b82f6;background:#eff6ff;}
.fp-choice.fp-selected .fp-pick::after{content:"selected";margin-left:auto;font-size:9px;color:#3b82f6;font-weight:700;}
.fp-choice.fp-eliminated .fp-pick{color:#9ca3af;text-decoration:line-through;}
.fp-choice.fp-correct{border:2px solid #16a34a;background:#dcfce7;}
.fp-choice.fp-correct .fp-pick::after{content:"\\2713 correct";margin-left:auto;font-size:9px;color:#16a34a;font-weight:700;}
.fp-choice.fp-wrong{border:2px solid #dc2626;background:#fee2e2;}
.fp-choice.fp-wrong .fp-pick::after{content:"\\2717 you chose";margin-left:auto;font-size:9px;color:#dc2626;font-weight:700;}
.fp-gridin-label{display:block;font-size:12px;color:#6b7280;margin-bottom:12px;}
.fp-gridin{display:block;width:100%;margin-top:5px;padding:9px 10px;border:1px solid #d1d5db;border-radius:8px;font:inherit;box-sizing:border-box;}
.fp-actions{display:flex;gap:8px;align-items:center;margin-bottom:10px;}
.fp-check{background:#3b82f6;color:#fff;border:none;border-radius:8px;padding:9px 18px;font-weight:700;cursor:pointer;font:inherit;}
.fp-reveal{background:#f1f5f9;color:#334155;border:none;border-radius:8px;padding:9px 14px;cursor:pointer;font:inherit;}
/* #27: after Check, the reveal control becomes the primary "Explain" action. */
.fp-reveal.fp-explain{background:#3b82f6;color:#fff;font-weight:700;}
.fp-next{margin-left:auto;background:#3b82f6;color:#fff;border:none;border-radius:8px;padding:9px 16px;font-weight:700;cursor:pointer;font:inherit;}
.fp-verdict{margin-bottom:10px;font-weight:700;}
/* verdict/prompt states — populated by the verdict writer in a later task */
.fp-verdict .fp-ok{color:#16a34a;}
.fp-verdict .fp-no{color:#dc2626;}
.fp-indeterminate{color:#92400e;font-weight:600;font-size:13px;}
.fp-need-answer{color:#1d4ed8;font-weight:600;font-size:13px;}
.fp-stale{color:#b45309;font-weight:600;font-size:13px;line-height:1.4;}
.fp-note-label{display:block;font-size:11px;color:#92400e;margin-bottom:12px;}
.fp-note{display:block;width:100%;margin-top:5px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;
  padding:8px;font:inherit;color:#92400e;resize:vertical;box-sizing:border-box;}
.fp-note::placeholder{color:#b45309;}
.fp-calc{display:flex;gap:8px;}
.fp-calc-pin,.fp-desmos{background:#f1f5f9;color:#334155;border:none;border-radius:8px;padding:8px 12px;cursor:pointer;font:inherit;font-size:12px;}
`;
