import { html, cardSlot } from './host';

export interface StartPanelState { hasSession: boolean; }
export interface StartPanelHandlers {
  onStartList: () => void;
  onStartRandom: () => void;
  onResume: () => void;     // deep resume logic is Plan 3; this just surfaces + fires the button
  onClose: () => void;      // ✕ dismiss: hide the overlay without starting a session
}

export function renderStartPanel(shadow: ShadowRoot, state: StartPanelState, h: StartPanelHandlers): void {
  // Render into the card slot so the calculator (in the extras slot) can't be clobbered, and
  // vice versa. The overlay (answer-overlay.ts) mounts directly into CB's .answer-content, not here.
  cardSlot(shadow).innerHTML = html(`
    <div class="fp-start">
      <div class="fp-start-head"><button class="fp-overlay-close" aria-label="Close">✕</button></div>
      <h2 class="fp-start-title">Start focused practice</h2>
      <button class="fp-start-list">Start in list order</button>
      <button class="fp-start-random">Randomize (loaded results)</button>
      ${state.hasSession ? `<button class="fp-resume">Resume where you left off</button>` : ''}
    </div>`) as unknown as string;

  shadow.querySelector('.fp-overlay-close')!.addEventListener('click', () => h.onClose());
  shadow.querySelector('.fp-start-list')!.addEventListener('click', () => h.onStartList());
  shadow.querySelector('.fp-start-random')!.addEventListener('click', () => h.onStartRandom());
  shadow.querySelector('.fp-resume')?.addEventListener('click', () => h.onResume());
}
