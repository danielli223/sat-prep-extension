import { html } from './host';
import { deriveStats, type Stats } from '../stats';
import type { Mistake } from '../journal';
import type { Attempt } from '../types';

// Journal/progress panel (spec §7). Renders into the shared Shadow-DOM host. EVERY innerHTML write
// goes through Plan 2's html() helper from host.ts — the SINGLE owner of the "focused-practice"
// TrustedTypes policy (contract §2.1 / spec §8.4). We do NOT call trustedTypes.createPolicy here: a
// second createPolicy with the same name throws "policy already exists" in real Trusted-Types
// browsers.
// Issue #34: the VM carries the raw `attempts` so the difficulty control can re-derive locally via
// deriveStats on change (student-own data — never question text). `difficulties` is the option list
// (derived from the data, not hardcoded); `selected` is the chosen subset (empty = all). All three
// are optional so existing call sites that pass only { stats, mistakes } keep working.
export interface PanelVM {
  stats: Stats; mistakes: Mistake[];
  attempts?: Attempt[];
  difficulties?: string[];
  selected?: Set<string>;
}

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
  </div>`;
}

// Issue #34: the inner markup of .fp-weak-areas for a given perSkill list. The change handler
// re-renders ONLY this block so the rest of the panel (stats, mistakes, the control itself) is
// untouched. Empty list → the same empty-state copy as the initial render.
function weakAreasInner(perSkill: Stats['perSkill']): string {
  const weak = perSkill.map(weakAreaHtml).join('');
  return weak || '<p class="fp-empty">Answer a few questions to see your weak areas.</p>';
}

// One checkbox option per difficulty, in the VM-provided order, each carrying the data-difficulty
// hook the integration layer (and the tests) key on. Checked reflects the current selection; an
// empty selection (= all) leaves every box unchecked.
function difficultyControlHtml(difficulties: string[], selected: Set<string>): string {
  const opts = difficulties.map((d) => {
    const checked = selected.has(d) ? ' checked' : '';
    return `<label class="fp-diff-opt"><input type="checkbox" class="fp-diff-cb" data-difficulty="${esc(d)}"${checked}><span>${esc(d)}</span></label>`;
  }).join('');
  return `<div class="fp-diff-filter">${opts}</div>`;
}

function mistakeHtml(m: Mistake): string {
  const note = m.note ? `<p class="fp-mistake-note">${esc(m.note)}</p>` : '';
  return `<li class="fp-mistake">
    <div class="fp-mistake-meta"><code>${esc(m.questionId)}</code> · ${esc(m.skill)} · ${esc(m.difficulty)} · ${day(m.lastSeenAt)}</div>
    ${note}
  </li>`;
}

export function renderPanel(host: ShadowRoot, vm: PanelVM): void {
  const { stats, mistakes } = vm;
  const difficulties = vm.difficulties ?? [];
  const selected = new Set(vm.selected ?? []);
  const attempts = vm.attempts ?? [];
  const mistakesHtml = mistakes.length
    ? `<ul class="fp-mistakes">${mistakes.map(mistakeHtml).join('')}</ul>`
    : `<p class="fp-empty">No mistakes logged yet — your missed questions will show up here.</p>`;
  const controlHtml = difficulties.length ? difficultyControlHtml(difficulties, selected) : '';

  let panel = host.querySelector('.fp-panel');
  if (!panel) { panel = document.createElement('section'); panel.className = 'fp-panel'; host.appendChild(panel); }
  setHtml(panel, `
    <header class="fp-panel-head"><h2>Your progress</h2><button class="fp-panel-close" aria-label="Close">✕</button></header>
    <div class="fp-stats">
      <div class="fp-stat"><span class="fp-stat-n">${stats.total}</span><span class="fp-stat-l">done</span></div>
      <div class="fp-stat"><span class="fp-stat-n">${pct(stats.accuracy)}</span><span class="fp-stat-l">accuracy</span></div>
      <div class="fp-stat"><span class="fp-stat-n">${stats.streakDays}</span><span class="fp-stat-l">day streak</span></div>
    </div>
    ${controlHtml}
    <h3>Weak areas (worst first)</h3>
    <div class="fp-weak-areas">${weakAreasInner(stats.perSkill)}</div>
    <h3>Mistakes</h3>
    ${mistakesHtml}`);

  panel.querySelector('.fp-panel-close')?.addEventListener('click', () => panel!.remove());

  // Issue #34: on any difficulty toggle, read the CURRENT checkbox state (the event doesn't carry
  // the value), re-derive the weak areas locally from the raw attempts, and re-render ONLY the
  // .fp-weak-areas block. No CB read, no network — pure aggregation over student-own data.
  if (difficulties.length) {
    const weakAreas = panel.querySelector('.fp-weak-areas') as HTMLElement;
    panel.querySelector('.fp-diff-filter')?.addEventListener('change', () => {
      const picked = new Set<string>();
      panel!.querySelectorAll<HTMLInputElement>('.fp-diff-cb').forEach((cb) => { if (cb.checked) picked.add(cb.dataset.difficulty!); });
      const filtered = deriveStats(attempts, { difficulties: picked });
      setHtml(weakAreas, weakAreasInner(filtered.perSkill));
    });
  }
}
