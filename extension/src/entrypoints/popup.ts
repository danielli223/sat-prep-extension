import { OPEN_JOURNAL, TELEMETRY_DELETE } from '../messages';
import { optIn, isOptedIn } from '../telemetry/consent';
import { optOut } from '../telemetry/lifecycle';

// Toolbar popup (spec §9 #9, §4 step 1). A plain link to CB's Question Bank (expressly permitted,
// D3) plus an "Open journal" button that tells the active tab's content script to mount the panel.
// No CB content is ever read here. Built with createElement (no innerHTML in the popup surface).
export const CB_SEARCH_URL = 'https://satsuiteeducatorquestionbank.collegeboard.org/digital/search';

export function renderPopup(root: HTMLElement): void {
  root.replaceChildren();

  const link = document.createElement('a');
  link.className = 'fp-open-qb';
  link.href = CB_SEARCH_URL;
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = 'Open SAT Question Bank';

  const journal = document.createElement('button');
  journal.className = 'fp-open-journal';
  journal.textContent = 'Open journal';
  journal.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const id = tabs[0]?.id;
        if (id !== undefined) chrome.tabs.sendMessage(id, { type: OPEN_JOURNAL });
        window.close();
      });
    }
  });

  const notice = document.createElement('p');
  notice.className = 'fp-notice';
  notice.textContent = 'Not affiliated with, authorized, or endorsed by College Board; SAT is a trademark of the College Board.';

  // Opt-in analytics (spec 2026-06-17): OFF by default, gated behind a 13+ attestation.
  const tele = document.createElement('section');
  tele.className = 'fp-telemetry';
  const blurb = document.createElement('p');
  blurb.textContent =
    'Optional: help improve this tool by sharing anonymous usage (which questions you practice and ' +
    'whether you got them right) with our analytics provider, PostHog (a US company). We send nothing ' +
    'that identifies you — never the questions themselves, your notes, or scores. Turn it off or delete ' +
    'your data anytime.';

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
  toggle.addEventListener('change', () => { void (toggle.checked ? optIn() : optOut()); });
  del.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) chrome.runtime.sendMessage({ type: TELEMETRY_DELETE });
    toggle.checked = false;
    age.checked = false;
    toggle.disabled = true;
  });

  // Reflect current state when the popup opens.
  void isOptedIn().then((on) => { if (on) { age.checked = true; toggle.disabled = false; toggle.checked = true; } });

  tele.append(blurb, ageLabel, toggleLabel, del);

  root.append(link, journal, tele, notice);
}

if (typeof document !== 'undefined' && document.getElementById('root') && typeof chrome !== 'undefined' && chrome.runtime?.id) {
  renderPopup(document.getElementById('root')!);
}
