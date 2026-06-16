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
        if (id !== undefined) chrome.tabs.sendMessage(id, { type: 'open-journal' });
        window.close();
      });
    }
  });

  const notice = document.createElement('p');
  notice.className = 'fp-notice';
  notice.textContent = 'Not affiliated with, authorized, or endorsed by College Board; SAT is a trademark of the College Board.';

  root.append(link, journal, notice);
}

if (typeof document !== 'undefined' && document.getElementById('root') && typeof chrome !== 'undefined' && chrome.runtime?.id) {
  renderPopup(document.getElementById('root')!);
}
