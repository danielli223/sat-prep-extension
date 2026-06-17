import { html } from './host';
import type { CardVM } from './view-model';

export interface AnswerHandlers {
  onSelect(letter: string): void; onEliminate(letter: string): void;
  onCheck(pick: string): void; onReveal(): void; onNext(): void;
  onToggleCalc(): void; onOpenDesmos(): void; onClose(): void;
  onNote(text: string): void;
}

const HOST_CLASS = 'fp-answer-host';

// CB's answer container (choices + rationale) inside the question modal.
export function findAnswerContent(modal: Element): HTMLElement | null {
  return modal.querySelector('.answer-content');
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

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
  shadow.querySelector('.fp-note')!.addEventListener('change', (e) =>
    h.onNote((e.target as HTMLTextAreaElement).value.trim()));
  shadow.querySelector('.fp-calc-pin')!.addEventListener('click', () => h.onToggleCalc());
  shadow.querySelector('.fp-desmos')!.addEventListener('click', () => h.onOpenDesmos());
}

// Mount (or reuse) our shadow host as the FIRST child of CB's .answer-content, hiding CB's own
// choices + rationale. Idempotent: CB may replace .answer-content on its in-place "Next", so this is
// called on every question emit and reuses an existing host when present.
export function mountAnswerOverlay(answerContent: HTMLElement, vm: CardVM, h: AnswerHandlers): ShadowRoot {
  // Hide CB's direct-child answer nodes. :scope > compound selectors are not supported in
  // happy-dom (test env), so iterate children directly — same semantics, works everywhere.
  for (const el of Array.from(answerContent.children)) {
    if (el.classList.contains('answer-choices') || el.classList.contains('rationale')) {
      (el as HTMLElement).style.display = 'none';
    }
  }

  // Reuse an existing direct-child host (idempotent re-mount). :scope > is unsupported in happy-dom,
  // so scan children directly — consistent with the hide-loop above.
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
  const shadow = host.shadowRoot!;
  shadow.innerHTML = html(`<style>${ANSWER_CSS}</style>` + renderBody(vm)) as unknown as string;
  wire(shadow, vm, h);
  return shadow;
}

const ANSWER_CSS = `
.fp-answer{font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#1f2937;}
.fp-answer-head{display:flex;justify-content:space-between;align-items:center;gap:12px;}
.fp-overlay-close{flex:none;border:none;background:#f1f5f9;color:#475569;border-radius:8px;width:30px;height:30px;cursor:pointer;font-size:13px;line-height:1;}
.fp-trust{font-size:10px;letter-spacing:.04em;color:#16a34a;font-weight:700;text-transform:uppercase;margin-bottom:10px;}
.fp-trust::before{content:"\\25CF  ";}
.fp-progress{display:flex;justify-content:space-between;gap:8px;font-size:11px;color:#6b7280;
  border-bottom:1px solid #eee;padding-bottom:8px;margin-bottom:12px;}
.fp-choices{list-style:none;margin:0 0 12px;padding:0;}
.fp-choice{display:flex;align-items:center;border:1px solid #e5e7eb;border-radius:9px;margin-bottom:7px;}
.fp-choice .fp-eliminate{border:none;background:transparent;color:#9ca3af;cursor:pointer;font-size:14px;padding:8px 4px 8px 10px;}
.fp-choice .fp-pick{flex:1;display:flex;align-items:center;text-align:left;border:none;background:transparent;
  cursor:pointer;padding:9px 12px 9px 2px;color:inherit;font:inherit;}
.fp-choice .fp-letter{font-weight:700;margin-right:8px;}
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
.fp-next{margin-left:auto;background:#3b82f6;color:#fff;border:none;border-radius:8px;padding:9px 16px;font-weight:700;cursor:pointer;font:inherit;}
.fp-verdict{margin-bottom:10px;font-weight:700;}
/* verdict/prompt states — populated by the verdict writer in a later task */
.fp-verdict .fp-ok{color:#16a34a;}
.fp-verdict .fp-no{color:#dc2626;}
.fp-indeterminate{color:#92400e;font-weight:600;font-size:13px;}
.fp-need-answer{color:#1d4ed8;font-weight:600;font-size:13px;}
.fp-note-label{display:block;font-size:11px;color:#92400e;margin-bottom:12px;}
.fp-note{display:block;width:100%;margin-top:5px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;
  padding:8px;font:inherit;color:#92400e;resize:vertical;box-sizing:border-box;}
.fp-note::placeholder{color:#b45309;}
.fp-calc{display:flex;gap:8px;}
.fp-calc-pin,.fp-desmos{background:#f1f5f9;color:#334155;border:none;border-radius:8px;padding:8px 12px;cursor:pointer;font:inherit;font-size:12px;}
`;
