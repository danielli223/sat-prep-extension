import { html } from './host';
import { esc } from './escape';
import { deriveStats, type Stats, type ToolCounts } from '../stats';
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
  // Lifetime per-question attempt count (getAttemptCounts) — shown next to each mistake row. Optional
  // so existing call sites that omit it keep working; missing/zero renders as no badge (never "0×").
  attemptCounts?: Record<string, number>;
  // This sitting's tool-usage snapshot (content.ts's shared ToolCounts) — optional for the same reason.
  toolCounts?: ToolCounts;
}

function setHtml(el: Element, markup: string): void {
  el.innerHTML = html(markup) as unknown as string;   // host.ts owns the one policy; we just route through it
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

function mistakeHtml(m: Mistake, attemptCounts: Record<string, number>): string {
  const note = m.note ? `<p class="fp-mistake-note">${esc(m.note)}</p>` : '';
  const count = attemptCounts[m.questionId] ?? 0;
  const countMeta = count > 1 ? ` · attempted ${count}×` : '';
  return `<li class="fp-mistake">
    <div class="fp-mistake-meta"><code>${esc(m.questionId)}</code> · ${esc(m.skill)} · ${esc(m.difficulty)} · ${day(m.lastSeenAt)}${countMeta}</div>
    ${note}
  </li>`;
}

const TOOL_LABEL: Record<keyof ToolCounts, string> = {
  check: 'Check', reveal: 'Reveal explanation', note: 'Note', desmos: 'Calculator', next: 'Next',
};

// "This session" tool-usage block (a live snapshot as of whenever the panel is opened — pagehide can't
// render UI to an unloading page, so this is the practical "end of session" view). Tools never used
// this sitting still show a 0, since the point is a full breakdown, not just what was touched.
function toolCountsHtml(counts: ToolCounts): string {
  const rows = (Object.keys(TOOL_LABEL) as (keyof ToolCounts)[])
    .map((key) => `<div class="fp-tool-count"><span class="fp-tool-n">${counts[key]}</span><span class="fp-tool-l">${esc(TOOL_LABEL[key])}</span></div>`)
    .join('');
  return `<h3>This session</h3><div class="fp-tool-counts">${rows}</div>`;
}

export function renderPanel(host: ShadowRoot, vm: PanelVM): void {
  const { stats, mistakes } = vm;
  const difficulties = vm.difficulties ?? [];
  const selected = new Set(vm.selected ?? []);
  const attempts = vm.attempts ?? [];
  const attemptCounts = vm.attemptCounts ?? {};
  const mistakesHtml = mistakes.length
    ? `<ul class="fp-mistakes">${mistakes.map((m) => mistakeHtml(m, attemptCounts)).join('')}</ul>`
    : `<p class="fp-empty">No mistakes logged yet — your missed questions will show up here.</p>`;
  const controlHtml = difficulties.length ? difficultyControlHtml(difficulties, selected) : '';
  const sessionHtml = vm.toolCounts ? toolCountsHtml(vm.toolCounts) : '';

  let panel = host.querySelector('.fp-panel');
  if (!panel) { panel = document.createElement('section'); panel.className = 'fp-panel'; host.appendChild(panel); }
  setHtml(panel, `
    <header class="fp-panel-head"><h2>Your progress</h2><button class="fp-panel-close" aria-label="Close">✕</button></header>
    <div class="fp-stats">
      <div class="fp-stat"><span class="fp-stat-n">${stats.total}</span><span class="fp-stat-l">done</span></div>
      <div class="fp-stat"><span class="fp-stat-n">${pct(stats.accuracy)}</span><span class="fp-stat-l">accuracy</span></div>
    </div>
    ${controlHtml}
    <h3>Weak areas (worst first)</h3>
    <div class="fp-weak-areas">${weakAreasInner(stats.perSkill)}</div>
    <h3>Mistakes</h3>
    ${mistakesHtml}
    ${sessionHtml}`);

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
