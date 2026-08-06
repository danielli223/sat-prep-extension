import { TELEMETRY_UI_ENABLED } from '../config';
import { renderTelemetryConsent } from '../ui/telemetry-consent';
import { TELEMETRY_DECLINED } from '../messages';

// First-run tab (spec §7), opened once by background.ts's onInstalled handler. Shows — once
// TELEMETRY_UI_ENABLED ships (gated on PRIVACY.md + the CWS disclosure form) — the same opt-in
// analytics ask used in the toolbar popup.
export function renderOnboarding(root: HTMLElement): void {
  root.replaceChildren();

  if (TELEMETRY_UI_ENABLED) renderTelemetryConsent(root);

  const cont = document.createElement('button');
  cont.className = 'fp-onboarding-continue';
  cont.textContent = 'Continue';
  cont.addEventListener('click', () => {
    // Dismissing first-run without opting in is the decline signal. Fire-and-forget: the background
    // decides whether it counts (it no-ops if they opted in, or if this install already counted).
    // Never blocks the close, and never runs when the consent ask was not even shown.
    if (TELEMETRY_UI_ENABLED) {
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
          chrome.runtime.sendMessage({ type: TELEMETRY_DECLINED });
        }
      } catch { /* no receiver / context gone — the counter is best-effort */ }
    }
    window.close();
  });
  root.append(cont);
}

if (typeof document !== 'undefined' && document.getElementById('root')) {
  renderOnboarding(document.getElementById('root')!);
}
