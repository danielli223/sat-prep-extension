import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readListQuestionIds } from './list-reader';

const here = dirname(fileURLToPath(import.meta.url));
function loadList(): Element {
  document.body.innerHTML = readFileSync(join(here, '__fixtures__', 'results-list.html'), 'utf8');
  return document.querySelector('.results-page')!;
}

describe('readListQuestionIds', () => {
  it('extracts {id,node} for every row that carries a question id, in document order', () => {
    const rows = readListQuestionIds(loadList());
    expect(rows.map((r) => r.id)).toEqual(['ab12cd34', 'ef56ab78', '99ff00aa']);
    expect(rows[0]!.node).toBeInstanceOf(Element);
    expect(rows[0]!.node.tagName).toBe('TR');   // the row node, for the badger to anchor a chip on
  });

  it('skips rows with no id (e.g. a loading row)', () => {
    const rows = readListQuestionIds(loadList());
    expect(rows.some((r) => r.node.classList.contains('loading-row'))).toBe(false);
  });

  it('returns [] when the root has no result rows', () => {
    document.body.innerHTML = '<div class="results-page"><p>No results.</p></div>';
    expect(readListQuestionIds(document.querySelector('.results-page')!)).toEqual([]);
  });

  // Issue #25: the nav-grid colors cells by difficulty, so the list-reader must surface each row's
  // difficulty TIER (taxonomy metadata in .difficulty-column — never question content), read live and
  // rendered, never stored. The existing fixture already carries Hard/Medium/Easy in the three rows.
  it('surfaces each row\'s .difficulty-column tier as `difficulty`, in document order', () => {
    const rows = readListQuestionIds(loadList());
    expect(rows.map((r) => r.difficulty)).toEqual(['Hard', 'Medium', 'Easy']);
  });

  it('still exposes ONLY id + node + difficulty — no question stem/choice/passage text leaks', () => {
    const rows = readListQuestionIds(loadList());
    for (const row of rows) {
      // The only string-valued fields a row may carry are the bare 8-hex id and a short difficulty
      // tier token. Anything else (a skill label, a stem, a choice) would be a content leak.
      expect(Object.keys(row).sort()).toEqual(['difficulty', 'id', 'node']);
      expect(row.id).toMatch(/^[0-9a-f]{8}$/i);
      expect(row.difficulty).toMatch(/^(Hard|Medium|Easy)$/);   // a tier token only — never free text
      expect(row.node).toBeInstanceOf(Element);
    }
  });

  it('yields difficulty "" for a row that has no .difficulty-column cell', () => {
    // Tiny SYNTHETIC table (never real CB content): one row with an id cell but no difficulty cell.
    document.body.innerHTML =
      '<div class="results-page"><table class="cb-table-react"><tbody>' +
      '<tr class="result-row"><td class="id-column"><button>deadbeef</button></td><td>Algebra</td></tr>' +
      '</tbody></table></div>';
    const rows = readListQuestionIds(document.querySelector('.results-page')!);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe('deadbeef');
    expect(rows[0]!.difficulty).toBe('');
  });
});
