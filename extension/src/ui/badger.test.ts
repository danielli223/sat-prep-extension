import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { badge, BADGE_CLASS } from './badger';

const here = dirname(fileURLToPath(import.meta.url));
function loadList(): Element {
  document.body.innerHTML = readFileSync(join(here, '..', 'cb', '__fixtures__', 'results-list.html'), 'utf8');
  return document.querySelector('.results-page')!;
}

describe('badge', () => {
  it('injects a done/missed/new chip per row keyed off the seen map', () => {
    const root = loadList();
    badge(root, { ab12cd34: 'done', ef56ab78: 'missed' }); // 99ff00aa absent → "new"
    const chips = [...root.querySelectorAll(`.${BADGE_CLASS}`)];
    expect(chips).toHaveLength(3);
    expect(chips[0]!.getAttribute('data-state')).toBe('done');
    expect(chips[0]!.textContent).toContain('done');
    expect(chips[1]!.getAttribute('data-state')).toBe('missed');
    expect(chips[1]!.textContent).toContain('missed');
    expect(chips[2]!.getAttribute('data-state')).toBe('new');
    expect(chips[2]!.textContent).toContain('new');
  });

  it('anchors each chip INSIDE the row\'s .id-column cell (valid table markup — the (c) requirement)', () => {
    const root = loadList();
    badge(root, { ab12cd34: 'done' });
    for (const chip of root.querySelectorAll(`.${BADGE_CLASS}`)) {
      // A <span> appended straight to a <tr> is invalid markup browsers relocate out of the row; the
      // chip must live in the id cell. Assert the chip's parent is the .id-column <td>, not the <tr>.
      const parent = chip.parentElement!;
      expect(parent.classList.contains('id-column')).toBe(true);
      expect(parent.tagName).toBe('TD');
    }
  });

  it('is idempotent: re-running with new data replaces chips, never duplicates them', () => {
    const root = loadList();
    badge(root, { ab12cd34: 'missed' });
    badge(root, { ab12cd34: 'done' });
    const chips = [...root.querySelectorAll(`.${BADGE_CLASS}`)];
    expect(chips).toHaveLength(3);                                   // one per row, not six
    expect(chips[0]!.getAttribute('data-state')).toBe('done');       // reflects the latest call
  });

  it('does not store or echo any CB question text — chips carry only state labels', () => {
    const root = loadList();
    badge(root, { ab12cd34: 'done' });
    for (const chip of root.querySelectorAll(`.${BADGE_CLASS}`)) {
      expect(chip.textContent).toMatch(/^(✓ done|⚠ missed|new)$/);
    }
  });

  it('styles each chip as an inline pill (light DOM — the shadow stylesheet cannot reach it)', () => {
    const root = loadList();
    badge(root, { ab12cd34: 'done' });
    const chip = root.querySelector(`.${BADGE_CLASS}`) as HTMLElement;
    expect(chip.getAttribute('style')).toMatch(/border-radius/);   // it's a pill, not bare text
    expect(chip.style.background).not.toBe('');                    // a per-state colour is applied inline
  });
});
