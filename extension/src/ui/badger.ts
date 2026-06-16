import { readListQuestionIds } from '../cb/list-reader';

// Re-surface badger (spec §7). Matches on-screen result IDs against the seen map and injects a
// state chip into each row. We create plain text-node chips (no innerHTML, no CB content echoed):
// the chip's only text is one of three fixed state labels. Idempotent — a prior chip on a row is
// removed before the new one is added, so repeated badge() calls never duplicate.
export const BADGE_CLASS = 'fp-badge';

type State = 'done' | 'missed' | 'new';
const LABEL: Record<State, string> = { done: '✓ done', missed: '⚠ missed', new: 'new' };

export function badge(listRoot: Element, seen: Record<string, 'done' | 'missed'>): void {
  for (const { id, node } of readListQuestionIds(listRoot)) {
    node.querySelector(`.${BADGE_CLASS}`)?.remove();
    const state: State = seen[id] ?? 'new';
    const chip = node.ownerDocument.createElement('span');
    chip.className = BADGE_CLASS;
    chip.setAttribute('data-state', state);
    chip.textContent = LABEL[state];   // textContent, never innerHTML — no CB text can leak in
    node.appendChild(chip);
  }
}
