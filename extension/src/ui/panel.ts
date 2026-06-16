import { html } from './host';
import type { Stats } from '../stats';
import type { Mistake } from '../journal';

// Journal/progress panel (spec §7). Renders into the shared Shadow-DOM host. EVERY innerHTML write
// goes through Plan 2's html() helper from host.ts — the SINGLE owner of the "focused-practice"
// TrustedTypes policy (contract §2.1 / spec §8.4). We do NOT call trustedTypes.createPolicy here: a
// second createPolicy with the same name throws "policy already exists" in real Trusted-Types
// browsers. "Practice [skill] on CB" / "Find on CB" are plain links to CB's QB carrying a
// data-skill hook — the student drives the filter (D3); the integration layer (Task 5b/Task 6)
// attaches the coachmark/badger hand-off. We never touch CB's controls and never auto-apply a filter.
export interface PanelVM { stats: Stats; mistakes: Mistake[]; }

// Educator Question Bank search page (a plain link — expressly permitted, spec §4 step 1).
export const CB_SEARCH_URL = 'https://satsuiteeducatorquestionbank.collegeboard.org/digital/search';

function setHtml(el: Element, markup: string): void {
  el.innerHTML = html(markup) as unknown as string;   // host.ts owns the one policy; we just route through it
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
const pct = (n: number) => `${Math.round(n * 100)}%`;
const day = (iso: string) => iso.slice(0, 10);

function weakAreaHtml(s: { skill: string; accuracy: number; total: number }): string {
  const tier = s.accuracy < 0.5 ? 'low' : s.accuracy < 0.7 ? 'mid' : 'high';   // red / amber / green
  return `<div class="fp-weak-area">
    <div class="fp-weak-head"><span class="fp-skill">${esc(s.skill)}</span><span class="fp-acc fp-acc-${tier}">${pct(s.accuracy)} (${s.total})</span></div>
    <div class="fp-bar"><div class="fp-bar-fill fp-bar-${tier}" style="width:${pct(s.accuracy)}"></div></div>
    <a class="fp-practice-link" data-skill="${esc(s.skill)}" href="${CB_SEARCH_URL}" target="_blank" rel="noopener">Practice ${esc(s.skill)} on CB</a>
  </div>`;
}

function mistakeHtml(m: Mistake): string {
  const note = m.note ? `<p class="fp-mistake-note">${esc(m.note)}</p>` : '';
  return `<li class="fp-mistake">
    <div class="fp-mistake-meta"><code>${esc(m.questionId)}</code> · ${esc(m.skill)} · ${esc(m.difficulty)} · ${day(m.lastSeenAt)}</div>
    ${note}
    <div class="fp-mistake-actions">
      <a class="fp-practice-link" data-skill="${esc(m.skill)}" href="${CB_SEARCH_URL}" target="_blank" rel="noopener">Practice ${esc(m.skill)}</a>
      <a class="fp-find-link" data-skill="${esc(m.skill)}" href="${CB_SEARCH_URL}" target="_blank" rel="noopener">Find on CB</a>
    </div>
  </li>`;
}

export function renderPanel(host: ShadowRoot, vm: PanelVM): void {
  const { stats, mistakes } = vm;
  const weak = stats.perSkill.map(weakAreaHtml).join('');
  const mistakesHtml = mistakes.length
    ? `<ul class="fp-mistakes">${mistakes.map(mistakeHtml).join('')}</ul>`
    : `<p class="fp-empty">No mistakes logged yet — your missed questions will show up here.</p>`;

  let panel = host.querySelector('.fp-panel');
  if (!panel) { panel = document.createElement('section'); panel.className = 'fp-panel'; host.appendChild(panel); }
  setHtml(panel, `
    <header class="fp-panel-head"><h2>Your progress</h2><button class="fp-panel-close" aria-label="Close">✕</button></header>
    <div class="fp-stats">
      <div class="fp-stat"><span class="fp-stat-n">${stats.total}</span><span class="fp-stat-l">done</span></div>
      <div class="fp-stat"><span class="fp-stat-n">${pct(stats.accuracy)}</span><span class="fp-stat-l">accuracy</span></div>
      <div class="fp-stat"><span class="fp-stat-n">${stats.streakDays}</span><span class="fp-stat-l">day streak</span></div>
    </div>
    <h3>Weak areas (worst first)</h3>
    <div class="fp-weak-areas">${weak || '<p class="fp-empty">Answer a few questions to see your weak areas.</p>'}</div>
    <h3>Mistakes</h3>
    ${mistakesHtml}`);

  panel.querySelector('.fp-panel-close')?.addEventListener('click', () => panel!.remove());
}
