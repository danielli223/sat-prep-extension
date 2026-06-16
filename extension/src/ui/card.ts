import { html, cardSlot } from './host';
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
  onClose: () => void;   // ✕ dismiss: hide the overlay; the caller clears the card slot but keeps the session alive
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

  // Render into the dedicated card slot, NOT the whole shadow root: the calculator iframe and any
  // other persistent overlays live in a sibling extras slot that must survive a card repaint.
  cardSlot(shadow).innerHTML = html(`
    <div class="fp-card">
      <div class="fp-card-head">
        <div class="fp-trust">Real College Board question · live, unaltered</div>
        <button class="fp-overlay-close" aria-label="Close">✕</button>
      </div>
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

  shadow.querySelector('.fp-overlay-close')!.addEventListener('click', () => h.onClose());
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
