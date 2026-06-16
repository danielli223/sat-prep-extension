import { readListQuestionIds } from '../cb/list-reader';

// Re-surface badger (spec §7). Matches on-screen result IDs against the seen map and injects a
// state chip into each row. We create plain text-node chips (no innerHTML, no CB content echoed):
// the chip's only text is one of three fixed state labels. Idempotent — a prior chip on a row is
// removed before the new one is added, so repeated badge() calls never duplicate.
export const BADGE_CLASS = 'fp-badge';

type State = 'done' | 'missed' | 'new';
const LABEL: Record<State, string> = { done: '✓ done', missed: '⚠ missed', new: 'new' };

// The chips live in CB's LIGHT DOM (not our shadow root), so the shadow stylesheet can't reach them.
// Style them inline as small pills, colored per state to match the approved journal mockup
// (done=green, missed=red, new=gray). Inline-only — no <style> injected into CB's page.
const PILL = 'display:inline-block;margin-left:8px;padding:1px 7px;border-radius:9px;' +
  'font:700 10px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;vertical-align:middle;';
const STYLE: Record<State, string> = {
  done: PILL + 'background:#dcfce7;color:#16a34a;',
  missed: PILL + 'background:#fee2e2;color:#dc2626;',
  new: PILL + 'background:#f1f5f9;color:#6b7280;',
};

export function badge(listRoot: Element, seen: Record<string, 'done' | 'missed'>): void {
  for (const { id, node } of readListQuestionIds(listRoot)) {
    // Anchor the chip INSIDE the row's id cell (the (c) requirement). A <span> appended directly to a
    // <tr> is invalid table markup — real browsers hoist stray inline content out of the row, so the
    // chip would render outside the table. The id cell is a <td>, a valid chip parent. Fall back to the
    // row only if the cell is missing (defensive; the live DOM always has .id-column).
    const anchor = node.querySelector('.id-column') ?? node;
    anchor.querySelector(`.${BADGE_CLASS}`)?.remove();   // idempotent: de-dup against the same anchor
    const state: State = seen[id] ?? 'new';
    const chip = anchor.ownerDocument.createElement('span');
    chip.className = BADGE_CLASS;
    chip.setAttribute('data-state', state);
    chip.style.cssText = STYLE[state];   // inline pill styling (light DOM; shadow CSS can't reach here)
    chip.textContent = LABEL[state];   // textContent, never innerHTML — no CB text can leak in
    anchor.appendChild(chip);
  }
}
