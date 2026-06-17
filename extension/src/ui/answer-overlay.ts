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
  shadow.innerHTML = html(`<style>${ANSWER_CSS}</style><div class="fp-answer"></div>`) as unknown as string;
  void vm; void h;   // wired in Task 5
  return shadow;
}

const ANSWER_CSS = `
.fp-answer{font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#1f2937;}
`;
