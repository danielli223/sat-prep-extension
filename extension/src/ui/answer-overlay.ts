import { html } from './host';
import type { CardVM, ChoiceVM } from './view-model';
import type { MathNode } from '../cb/reader';
import type { ScoreResult } from '../scoring';

export interface AnswerHandlers {
  onSelect(letter: string): void; onEliminate(letter: string): void;
  onCheck(pick: string): void; onReveal(): void; onNext(): void;
  onOpenDesmos(): void; onClose(): void;
  onNote(text: string): void;
}

const HOST_CLASS = 'fp-answer-host';
const EXTRAS_HOST_CLASS = 'fp-extras-host';   // issue #22: note + calc, a separate host appended LAST (below CB's .rationale)
// True for EITHER of our two hosts (interaction or extras) — used everywhere we must never hide or disturb our own nodes.
function isOurHost(el: Element): boolean {
  return el.classList.contains(HOST_CLASS) || el.classList.contains(EXTRAS_HOST_CLASS);
}
// Marker on the CB-native nodes WE hid, so teardown restores exactly those (and never un-hides a node
// CB itself had hidden). Also lets the MutationObserver and revealRationale find our own work.
const HIDDEN_ATTR = 'data-fp-hidden';
// Marker on a CB-native node we DELIBERATELY revealed + repositioned (the rationale, on reveal). The
// masking observer treats the move as an addedNode and would re-hide it; this flags "hands off — the
// student asked to see this" so hideCbNode skips it. Only the explicitly-revealed node is exempt.
const REVEALED_ATTR = 'data-fp-revealed';

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
  if (isOurHost(el)) return;   // never touch either of our hosts (interaction + extras)
  if (el.hasAttribute(REVEALED_ATTR)) return;      // a deliberate reveal/move — observer must not re-hide it
  if (el.hasAttribute(HIDDEN_ATTR)) return;
  el.setAttribute(HIDDEN_ATTR, '');
  el.style.display = 'none';
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Render a neutral math AST (issue #35) into OUR OWN tags. esc() runs on every text value — this is
// the sole XSS boundary (host.ts's TrustedTypes policy is identity, no sanitization). We never emit
// CB markup; only our own structural tags carry the AST's structure.
function renderMath(n: MathNode): string {
  switch (n.kind) {
    case 'text': return esc(n.value);
    case 'row': return n.items.map(renderMath).join('');
    case 'sup': return `${renderMath(n.base)}<sup>${renderMath(n.sup)}</sup>`;
    case 'sub': return `${renderMath(n.base)}<sub>${renderMath(n.sub)}</sub>`;
    case 'subsup': return `${renderMath(n.base)}<sub>${renderMath(n.sub)}</sub><sup>${renderMath(n.sup)}</sup>`;
    case 'frac': return `<span class="fp-frac"><span class="fp-frac-num">${renderMath(n.num)}</span><span class="fp-frac-den">${renderMath(n.den)}</span></span>`;
    case 'sqrt': return `<span class="fp-sqrt"><span class="fp-sqrt-rad">${renderMath(n.radicand)}</span></span>`;
  }
}

function choiceBody(c: ChoiceVM): string {
  if (c.imgSrc) {
    return `<img src="${esc(c.imgSrc)}" alt="${esc(c.text || c.letter)}" class="fp-choice-img" />`;
  }
  if (c.math) return renderMath(c.math);
  return esc(c.text);
}

function renderBody(vm: CardVM): string {
  const answerBody = vm.kind === 'mc'
    ? `<ul class="fp-choices">${vm.choices.map((c) => `
        <li class="fp-choice" data-letter="${esc(c.letter)}">
          <button class="fp-eliminate" aria-label="Cross off ${esc(c.letter)}">⊘</button>
          <button class="fp-pick"><span class="fp-letter">${esc(c.letter)}</span><span class="fp-choice-text">${choiceBody(c)}</span></button>
        </li>`).join('')}</ul>`
    : `<label class="fp-gridin-label">Your answer
         <input class="fp-gridin" type="text" inputmode="text" autocomplete="off" /></label>`;
  return `<div class="fp-answer">
    <div class="fp-answer-head">
      <button class="fp-overlay-close" aria-label="Close">✕</button>
    </div>
    ${answerBody}
    <div class="fp-actions">
      <button class="fp-check">Check</button>
      <button class="fp-reveal">Reveal explanation</button>
      <button class="fp-next">Next</button>
    </div>
    <div class="fp-verdict" aria-live="polite"></div>
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
}

// The extras block (issue #22): the note + the single Calculator button. Rendered into the SEPARATE
// extras host (last child of .answer-content) so it sits BELOW CB's native .rationale/explanation.
function renderExtras(): string {
  return `<div class="fp-answer">
    <label class="fp-note-label">Why did you miss it?
      <textarea class="fp-note" rows="1" placeholder="one line — your own note"></textarea>
    </label>
    <div class="fp-calc">
      <button class="fp-calc-open">Calculator</button>
    </div>
  </div>`;
}

// Wire the extras shadow (note + calc). Same handlers as the single-host layout — only the host moved.
function wireExtras(shadow: ShadowRoot, h: AnswerHandlers): void {
  shadow.querySelector('.fp-note')!.addEventListener('change', (e) =>
    h.onNote((e.target as HTMLTextAreaElement).value.trim()));
  shadow.querySelector('.fp-calc-open')!.addEventListener('click', () => h.onOpenDesmos());
}

// Mask CB's own .answer-content children (display:none + our marker) WITHOUT mounting a host. This is
// the FOUC primitive (#38): the orchestrator calls it the moment CB's modal is observed — decoupled
// from observeQuestions' 150ms read-debounce — so CB's raw choices never flash visible before the
// overlay mounts on the settled read. mountAnswerOverlay reuses it so the masking is shared and the
// existing unmountAnswerOverlay (keyed on the same data-fp-hidden marker) already restores it.
//
// Masking is whitelist-based, not blacklist-based: we hide EVERY direct child that isn't our host
// (so a future CB class rename can't leak content), and we install a MutationObserver to hide any
// node CB injects LATER — critically CB's `.rationale`, which the reveal drives in asynchronously
// (~150ms) and so does NOT exist at mask time. revealRationale is the sole un-hider.
//
// Idempotent: re-calling disconnects+reinstalls the per-container observer via the WeakMap (no stacked
// observers across CB's in-place re-renders or an early-mask-then-mount sequence).
export function maskAnswerContent(answerContent: HTMLElement): void {
  // Catch async-injected nodes (M1): CB injects .rationale after the mask. Hide any NEW non-host direct
  // child the same way. Disconnect a prior observer first so re-masks/re-mounts don't stack observers.
  //
  // ORDER MATTERS — install the observer BEFORE the synchronous sweep below, then sweep current
  // children. This is gap-free across re-masks: on CB's in-place re-render we disconnect the old
  // observer and immediately install a fresh one, then sweep. A node injected between the old observer's
  // disconnect and the new one's observe() would escape the observer — but the post-observe sweep hides
  // any such already-present node. Conversely, anything injected after the sweep is caught by the now-
  // active observer. No window is left where a CB node can stay visible. (Without this ordering, the
  // async .rationale injection that lands at ~the same time as the debounced re-mount intermittently
  // leaked through the disconnect gap — live-race flake.)
  hideObservers.get(answerContent)?.disconnect();
  const observer = new MutationObserver((records) => {
    let cbNodeAdded = false;
    for (const rec of records) {
      for (const node of Array.from(rec.addedNodes)) {
        // childList (non-subtree) only reports direct children; guard is belt-and-suspenders — do NOT add subtree:true (would hide CB's nested nodes)
        if (node.nodeType === 1 && (node as Element).parentElement === answerContent) {
          const el = node as HTMLElement;
          if (isOurHost(el)) continue;   // our own host (e.g. the extras re-anchor below) — ignore (prevents an infinite observer loop)
          hideCbNode(el);
          cbNodeAdded = true;
        }
      }
    }
    // Keep the extras host LAST so note/calc stay BELOW any CB node injected after mount — critically
    // CB's async .rationale (~150ms), which lands as a fresh last child after our mount-time append (#22).
    if (cbNodeAdded) reanchorExtras(answerContent);
  });
  observer.observe(answerContent, { childList: true });
  hideObservers.set(answerContent, observer);

  // Whitelist hide: every direct child that ISN'T our host (covers .answer-choices + any present
  // .rationale + anything else CB rendered). :scope > is unsupported in happy-dom, so scan children.
  for (const el of Array.from(answerContent.children)) hideCbNode(el as HTMLElement);
  // A .rationale present at mask time would sit below the extras host; restore extras-last. On the FOUC
  // curtain path (extras host not yet created) this is a no-op.
  reanchorExtras(answerContent);
}

// Move the extras host (note + calc) back to LAST child so it stays below CB's .rationale (#22). No-op
// when the extras host doesn't exist yet (the FOUC curtain path) or is already last.
function reanchorExtras(answerContent: HTMLElement): void {
  const extras = Array.from(answerContent.children)
    .find((c) => c.classList.contains(EXTRAS_HOST_CLASS)) as HTMLElement | undefined;
  if (extras && answerContent.lastElementChild !== extras) answerContent.appendChild(extras);
}

// Create (or reuse) our shadow host as the FIRST child of CB's .answer-content. Idempotent: CB may
// replace .answer-content on its in-place "Next", so callers re-run this and reuse the existing host.
// :scope > is unsupported in happy-dom, so scan children directly.
function ensureHost(answerContent: HTMLElement): HTMLElement {
  const existing = Array.from(answerContent.children)
    .find((c) => c.classList.contains(HOST_CLASS)) as HTMLElement | undefined;
  if (existing) return existing;
  const doc = answerContent.ownerDocument!;
  const host = doc.createElement('div');
  host.className = HOST_CLASS;
  // CB closes its modal on outside pointer-down; stop our events at the host (belt-and-suspenders —
  // we are inside the modal, but keep parity with the old body host).
  for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'] as const) {
    host.addEventListener(t, (e) => e.stopPropagation());
  }
  answerContent.insertBefore(host, answerContent.firstChild);
  host.attachShadow({ mode: 'open' });
  return host;
}

// Create (or reuse) the extras shadow host as the LAST child of CB's .answer-content (issue #22), so the
// note + calculator render BELOW CB's native .rationale/explanation. Idempotent like ensureHost.
function ensureExtrasHost(answerContent: HTMLElement): HTMLElement {
  const existing = Array.from(answerContent.children)
    .find((c) => c.classList.contains(EXTRAS_HOST_CLASS)) as HTMLElement | undefined;
  if (existing) return existing;
  const doc = answerContent.ownerDocument!;
  const host = doc.createElement('div');
  host.className = EXTRAS_HOST_CLASS;
  // CB closes its modal on outside pointer-down; stop our events at the host (parity with the main host).
  for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'] as const) {
    host.addEventListener(t, (e) => e.stopPropagation());
  }
  answerContent.appendChild(host);   // LAST child
  host.attachShadow({ mode: 'open' });
  return host;
}

// The opaque "white rectangle" we drop over CB's answer region before the real overlay mounts. A plain
// light-DOM element (NOT the shadow host), so `.fp-answer-host` still means "the real overlay is up".
const CURTAIN_CLASS = 'fp-curtain';

function removeCurtain(answerContent: HTMLElement): void {
  Array.from(answerContent.children).find((c) => c.classList.contains(CURTAIN_CLASS))?.remove();
}

// FOUC curtain (#38): the instant CB's answer region is observed — BEFORE the 150ms-debounced overlay
// mount — hide CB's raw content AND drop an opaque white rectangle over it, so the student never sees
// CB's unstyled choices flash. mountAnswerOverlay removes this rectangle when the real UI mounts, so the
// nice UI loads over the white rectangle. Idempotent and safe to call on every mutation while the modal
// renders: a no-op once the real overlay host is mounted, and it keeps a single curtain. Teardown
// (unmountAnswerOverlay, the degrade/close path) removes it and restores CB's nodes.
export function mountCurtain(answerContent: HTMLElement): void {
  maskAnswerContent(answerContent);
  if (answerContent.querySelector(`.${HOST_CLASS}`)) return;   // real overlay already up — no curtain needed
  if (Array.from(answerContent.children).some((c) => c.classList.contains(CURTAIN_CLASS))) return;  // already curtained
  const curtain = answerContent.ownerDocument!.createElement('div');
  curtain.className = CURTAIN_CLASS;
  curtain.setAttribute('aria-hidden', 'true');
  curtain.style.cssText = 'min-height:140px;background:#fff;border-radius:8px;';
  answerContent.insertBefore(curtain, answerContent.firstChild);
}

// Mount (or reuse) our shadow host as the FIRST child of CB's .answer-content, mask CB's own content,
// remove the FOUC curtain, and fill the host with the interactive overlay (so the nice UI replaces the
// white rectangle). Idempotent across CB's in-place "Next". Masking shares maskAnswerContent (the FOUC
// primitive) so a node hidden before mount stays hidden and unmount restores exactly our marked nodes.
export function mountAnswerOverlay(answerContent: HTMLElement, vm: CardVM, h: AnswerHandlers): ShadowRoot {
  const host = ensureHost(answerContent);
  const extrasHost = ensureExtrasHost(answerContent);   // created BEFORE the mask sweep → exempt (isOurHost) + anchored last
  maskAnswerContent(answerContent);
  removeCurtain(answerContent);
  const shadow = host.shadowRoot!;
  shadow.innerHTML = html(`<style>${ANSWER_CSS}</style>` + renderBody(vm)) as unknown as string;
  wire(shadow, vm, h);
  // Note + calc live in the extras shadow (issue #22). Reuse ANSWER_CSS — it carries the .fp-note/.fp-calc styles.
  const extrasShadow = extrasHost.shadowRoot!;
  extrasShadow.innerHTML = html(`<style>${ANSWER_CSS}</style>` + renderExtras()) as unknown as string;
  wireExtras(extrasShadow, h);
  // Contract: return the INTERACTION shadow (choices/verdict live here; renderVerdict etc. target it).
  return shadow;
}

// Teardown: restore CB's native content and remove our overlay. Used by onClose / last-question Next.
// Without this, removing only our host leaves CB's masked nodes stuck at display:none (a blank CB
// question). Disconnects the observer, un-hides exactly the nodes WE marked, and removes the host.
export function unmountAnswerOverlay(answerContent: HTMLElement): void {
  hideObservers.get(answerContent)?.disconnect();
  hideObservers.delete(answerContent);
  // Restore both the nodes WE hid and the one we deliberately revealed, clearing both markers so a
  // later re-mount + re-teardown starts from a clean slate.
  for (const el of Array.from(answerContent.querySelectorAll<HTMLElement>(`[${HIDDEN_ATTR}],[${REVEALED_ATTR}]`))) {
    el.style.display = '';
    el.removeAttribute(HIDDEN_ATTR);
    el.removeAttribute(REVEALED_ATTR);
  }
  answerContent.querySelector('.fp-answer-host')?.remove();
  answerContent.querySelector('.fp-extras-host')?.remove();   // extras host (note + calc) — issue #22
  removeCurtain(answerContent);   // FOUC curtain (#38): drop the white rectangle too, if it's still up
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
  // #20: move CB's explanation ABOVE our interaction host so it renders directly under the question —
  // co-visible with our (tall) UI rather than buried below it. Reposition CB's own node; never copy
  // its text into our shadow root. The move is a childList mutation, so flag REVEALED_ATTR before
  // un-hiding so the masking observer's hideCbNode doesn't re-hide this deliberate reveal.
  const host = Array.from(answerContent.children)
    .find((c) => c.classList.contains(HOST_CLASS)) as HTMLElement | undefined;
  if (host && r.nextSibling !== host) answerContent.insertBefore(r, host);
  r.setAttribute(REVEALED_ATTR, '');
  r.style.display = '';
  r.removeAttribute(HIDDEN_ATTR);
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
.fp-choices{list-style:none;margin:0 0 12px;padding:0;}
.fp-choice{display:flex;align-items:center;border:1px solid #e5e7eb;border-radius:9px;margin-bottom:7px;}
.fp-choice .fp-eliminate{border:none;background:transparent;color:#9ca3af;cursor:pointer;font-size:14px;padding:8px 4px 8px 10px;}
.fp-choice .fp-pick{flex:1;display:flex;align-items:baseline;gap:8px;text-align:left;border:none;background:transparent;
  cursor:pointer;padding:8px 12px 8px 2px;color:inherit;font:inherit;line-height:1.4;}
.fp-choice .fp-letter{flex:none;font-weight:700;}
.fp-choice .fp-choice-text{flex:1;min-width:0;}
.fp-choice-img{max-height:2.5em;width:auto;vertical-align:middle;}
/* faithful math (#35): stacked fraction with a bar, and a radical with an overline */
.fp-frac{display:inline-flex;flex-direction:column;text-align:center;vertical-align:middle;margin:0 .15em;line-height:1.1;}
.fp-frac-num{padding:0 .25em;}
.fp-frac-den{padding:0 .25em;border-top:1px solid currentColor;}
.fp-sqrt{display:inline-flex;align-items:flex-start;}
.fp-sqrt::before{content:"\\221A";margin-right:.05em;}
.fp-sqrt-rad{border-top:1px solid currentColor;padding:0 .15em;}
.fp-choice.fp-selected{border:2px solid #3b82f6;background:#eff6ff;}
.fp-choice.fp-selected .fp-pick::after{content:"selected";flex:none;margin-left:auto;font-size:9px;color:#3b82f6;font-weight:700;align-self:center;}
.fp-choice.fp-eliminated .fp-pick{color:#9ca3af;text-decoration:line-through;}
.fp-choice.fp-correct{border:2px solid #16a34a;background:#dcfce7;}
.fp-choice.fp-correct .fp-pick::after{content:"\\2713 correct";flex:none;margin-left:auto;font-size:9px;color:#16a34a;font-weight:700;align-self:center;}
.fp-choice.fp-wrong{border:2px solid #dc2626;background:#fee2e2;}
.fp-choice.fp-wrong .fp-pick::after{content:"\\2717 you chose";flex:none;margin-left:auto;font-size:9px;color:#dc2626;font-weight:700;align-self:center;}
.fp-gridin-label{display:block;font-size:12px;color:#6b7280;margin-bottom:12px;}
.fp-gridin{display:block;width:100%;margin-top:5px;padding:9px 10px;border:1px solid #d1d5db;border-radius:8px;font:inherit;box-sizing:border-box;}
.fp-actions{display:flex;gap:8px;align-items:center;margin-bottom:10px;}
.fp-check{background:#3b82f6;color:#fff;border:none;border-radius:8px;padding:9px 18px;font-weight:700;cursor:pointer;font:inherit;}
.fp-reveal{background:#f1f5f9;color:#334155;border:none;border-radius:8px;padding:9px 14px;cursor:pointer;font:inherit;}
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
.fp-calc-open{background:#f1f5f9;color:#334155;border:none;border-radius:8px;padding:8px 12px;cursor:pointer;font:inherit;font-size:12px;}
`;
