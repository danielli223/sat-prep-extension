import { TELEMETRY_DELETE, TELEMETRY_OPTOUT } from '../messages';
import { optIn, isOptedIn } from '../telemetry/consent';

// Opt-in analytics consent surface (spec 2026-06-17): OFF by default, gated behind a 13+ attestation.
// Shared by the toolbar popup and the first-run onboarding tab — both gate rendering it behind
// TELEMETRY_UI_ENABLED; this module only builds the DOM, it never decides whether to show it.
export function renderTelemetryConsent(root: HTMLElement): void {
  const tele = document.createElement('section');
  tele.className = 'fp-telemetry';
  const blurb = document.createElement('p');
  blurb.textContent =
    'Want to share your usage data? It really helps us make this extension better, showing us which ' +
    'features people use most. Nothing that identifies you ever leaves your device, not the questions ' +
    'themselves, your notes, or scores. You can turn this off or delete your data anytime. We appreciate ' +
    'it if you turn this on!';

  const ageLabel = document.createElement('label');
  const age = document.createElement('input');
  age.type = 'checkbox'; age.className = 'fp-telemetry-age';
  ageLabel.append(age, document.createTextNode(" I'm 13 or older"));

  const toggleLabel = document.createElement('label');
  const toggle = document.createElement('input');
  toggle.type = 'checkbox'; toggle.className = 'fp-telemetry-toggle'; toggle.disabled = true;
  toggleLabel.append(toggle, document.createTextNode(' Share anonymous usage analytics'));

  const del = document.createElement('button');
  del.className = 'fp-telemetry-delete'; del.textContent = 'Delete my analytics data';

  age.addEventListener('change', () => { toggle.disabled = !age.checked; });
  toggle.addEventListener('change', () => {
    if (toggle.checked) {
      // Opt-IN stays local: it only writes chrome.storage, no egress. Keep it off the message path.
      void optIn();
    } else {
      // Opt-OUT must run in the BACKGROUND (the single egress point): it builds + flushes the final
      // telemetry_disabled with the full super-prop set, then clears local state. Best-effort.
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) chrome.runtime.sendMessage({ type: TELEMETRY_OPTOUT });
      } catch { /* no receiver / context gone — opt-out is best-effort */ }
    }
  });
  del.addEventListener('click', () => {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) chrome.runtime.sendMessage({ type: TELEMETRY_DELETE });
    } catch { /* no receiver / context gone — delete is best-effort */ }
    toggle.checked = false;
    age.checked = false;
    toggle.disabled = true;
  });

  // Reflect current state when the surface opens.
  void isOptedIn().then((on) => { if (on) { age.checked = true; toggle.disabled = false; toggle.checked = true; } });

  tele.append(blurb, ageLabel, toggleLabel, del);
  root.append(tele);
}
