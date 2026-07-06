import { TELEMETRY_UI_ENABLED } from '../config';
import { renderTelemetryConsent } from '../ui/telemetry-consent';

// First-run tab (spec §7), opened once by background.ts's onInstalled handler. Shows — once
// TELEMETRY_UI_ENABLED ships (gated on PRIVACY.md + the CWS disclosure form) — the same opt-in
// analytics ask used in the toolbar popup.
export function renderOnboarding(root: HTMLElement): void {
  root.replaceChildren();

  if (TELEMETRY_UI_ENABLED) renderTelemetryConsent(root);

  const cont = document.createElement('button');
  cont.className = 'fp-onboarding-continue';
  cont.textContent = 'Continue';
  cont.addEventListener('click', () => window.close());
  root.append(cont);
}

if (typeof document !== 'undefined' && document.getElementById('root')) {
  renderOnboarding(document.getElementById('root')!);
}
