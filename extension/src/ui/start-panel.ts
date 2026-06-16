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
