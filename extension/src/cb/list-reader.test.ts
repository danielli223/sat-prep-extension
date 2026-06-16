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
});
