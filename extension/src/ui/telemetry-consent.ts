import { TELEMETRY_DELETE, TELEMETRY_OPTOUT } from '../messages';
import { optIn, isOptedIn } from '../telemetry/consent';

// Opt-in analytics consent surface (spec 2026-06-17): OFF by default, gated behind a 13+ attestation.
// Shared by the toolbar popup and the first-run onboarding tab — both gate rendering it behind
// TELEMETRY_UI_ENABLED; this module only builds the DOM, it never decides whether to show it.
export function renderTelemetryConsent(root: HTMLElement): void {
  const tele = document.createElement('section');
  tele.className = 'fp-telemetry';
  // Disclosure copy is a COMPLIANCE surface, not marketing. Split into three parts so the ask reads
  // fast without dropping anything legally load-bearing:
  //   lead    — the friendly ask and why we want it.
  //   promise — the Limited Use commitments, visually emphasised. Chrome Web Store's Limited Use
  //             policy expects these; no-sale/no-ads is also what keeps us clear of the principal
  //             CCPA-under-16 and state minor triggers (telemetry spec, "State laws").
  //   detail  — the actual disclosure. Must match what events.ts really sends, and must name the
  //             processor, the purpose, and the retention period BEFORE opt-in: the COPPA
  //             internal-operations posture in the telemetry spec depends on disclosing both.
  // Do NOT trim `detail` for brevity — every clause in it is carrying legal weight. An earlier
  // version claimed scores never leave the device, which question_attempted.result contradicts.
  const lead = document.createElement('p');
  lead.className = 'fp-telemetry-lead';
  lead.textContent =
    'Help us make Focused Practice better. Anonymous usage data shows us which features students ' +
    'actually use — and tells us when the extension breaks.';

  const promise = document.createElement('p');
  promise.className = 'fp-telemetry-promise';
  promise.textContent =
    'Used only to improve the extension. Never sold, never used for advertising, and never used to ' +
    'profile or contact you.';

  const detail = document.createElement('p');
  detail.className = 'fp-telemetry-detail';
  detail.textContent =
    'If you turn this on, we send: question IDs, their topic and difficulty, whether you got each one ' +
    'right or wrong, and which features you used — tied to a random ID, never your name or IP address. ' +
    'We never send the question text or what your notes say. It is processed by PostHog, deleted after ' +
    '12 months, and you can switch it off or erase it here at any time. ' +
    'If you say no, we add 1 to a plain counter of how many people said no — with nothing attached to ' +
    'it, not even a random ID, so it can never be traced back to you.';

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

  tele.append(lead, promise, detail, ageLabel, toggleLabel, del);
  root.append(tele);
}
