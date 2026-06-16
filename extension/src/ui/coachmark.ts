import { html } from './host';

// Coachmark hand-off (spec §7/§4). When the student clicks "Practice [skill] on CB" / "Find on CB",
// the integration layer opens CB's QB (a plain <a>, D3) AND drops this coachmark into the shared
// host. The coachmark names the filter to set on CB and, on the student's confirmation, fires
// onConfirm — the content script's badger re-highlight. We never automate CB's controls and never
// read CB content; this is purely OUR overlay coaching + a callback. All innerHTML routes through
// host.ts's html() (the single TrustedTypes policy owner — contract §2.1).
export const COACHMARK_CLASS = 'fp-coachmark';

export interface CoachmarkOpts { skill: string; onConfirm: () => void; }

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export function dropCoachmark(host: ShadowRoot, opts: CoachmarkOpts): void {
  host.querySelector(`.${COACHMARK_CLASS}`)?.remove();   // idempotent: never stack two
  const mark = document.createElement('aside');
  mark.className = COACHMARK_CLASS;
  mark.innerHTML = html(
    `<p class="fp-coachmark-text">On CB's Question Bank, set the <strong>${esc(opts.skill)}</strong> filter,
       then come back here.</p>
     <div class="fp-coachmark-actions">
       <button class="fp-coachmark-confirm">Done — highlight them</button>
       <button class="fp-coachmark-dismiss">Dismiss</button>
     </div>`) as unknown as string;
  host.appendChild(mark);

  mark.querySelector('.fp-coachmark-confirm')!.addEventListener('click', () => {
    opts.onConfirm();           // hand off to the badger re-highlight
    mark.remove();
  });
  mark.querySelector('.fp-coachmark-dismiss')!.addEventListener('click', () => mark.remove());
}
