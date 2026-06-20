// CONTRACT TEST for the CB DOM-drift watchdog (#4).
//
// `fingerprint.ts` produces a STRUCTURE-ONLY projection of the CB question DOM — booleans, counts,
// and selector-names — so the drift signal can be logged and diffed safely. The bright line
// (invariant #3 / #2): the fingerprint must NEVER carry any question/choice/passage/rationale TEXT.
// `reader.ts` returns TEXT (RAM-only, never logged); `fingerprint.ts` is the content-free sibling
// that IS safe to persist/log/diff. These tests lock that two-part contract:
//   1) every value in the fingerprint is a primitive, and NONE of the fixture's question text leaks.
//   2) the fingerprint reports presence/absence + counts for exactly the selectors reader.ts /
//      list-reader.ts depend on (dialog container, header <h4> id, taxonomy table + data row,
//      stem node, answer-choices count, rationale presence; results table + row count).
//   3) on a DRIFTED DOM (renamed container / missing choices list / renamed results table) the
//      matching boolean flips or the count goes 0 — i.e. the fingerprint actually detects the break.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fingerprint, fingerprintList } from './fingerprint';

const here = dirname(fileURLToPath(import.meta.url));
const readFixture = (name: string) => readFileSync(join(here, '__fixtures__', name), 'utf8');

// Mount a fixture into the live document and return the root node the readers operate on.
function loadQuestion(name: string): Element {
  document.body.innerHTML = readFixture(name);
  return document.querySelector('.cb-dialog-container')!;
}
function loadList(): Element {
  document.body.innerHTML = readFixture('results-list.html');
  return document.querySelector('.results-page')!;
}

// Every question-text / choice / rationale string baked into the synthetic fixtures. NONE of these
// may appear anywhere in the serialized fingerprint — that is the content-free guarantee that makes
// the signal safe to log. (All are marked [SYNTHETIC] in the fixtures; no real CB content exists.)
const FIXTURE_TEXT = [
  'If 3x + 7 = 22, what is the value of x?',
  'Subtract 7 from both sides',
  'What value of s gives the system infinitely many solutions?',
  'Match the coefficients',
  'Which expression is equivalent',
  'Match the factored form',
  '[SYNTHETIC]',
  'Correct Answer',
  'Linear equations',
  'Inferences',
];

// A fingerprint is "content-free" when it is a flat object whose values are all primitives
// (boolean | number | string). String values are allowed ONLY for stable selector-NAMES we choose,
// never for scraped page text — so additionally assert no fixture text appears in any string value.
function assertContentFree(fp: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(fp)) {
    const t = typeof value;
    expect(['boolean', 'number', 'string'], `value at "${key}" must be a primitive`).toContain(t);
  }
  const blob = JSON.stringify(fp);
  for (const text of FIXTURE_TEXT) {
    expect(blob, `fingerprint leaked question text: "${text}"`).not.toContain(text);
  }
}

describe('fingerprint (single question) — content-free projection', () => {
  it('returns ONLY primitives and leaks NO question/choice/rationale text (MC)', () => {
    const fp = fingerprint(loadQuestion('multiple-choice.html')) as Record<string, unknown>;
    assertContentFree(fp);
  });

  it('leaks no text for grid-in or image-choice fixtures either', () => {
    assertContentFree(fingerprint(loadQuestion('grid-in.html')) as Record<string, unknown>);
    assertContentFree(fingerprint(loadQuestion('image-choice.html')) as Record<string, unknown>);
  });

  it('does not carry the bare 8-hex question id as captured page data', () => {
    // The id is question-bank metadata, not content, but the fingerprint is a STRUCTURE signal:
    // it should report only THAT an id was found (a boolean), never the id value itself — so a logged
    // drift trace can never be tied back to which specific questions a student opened.
    const fp = fingerprint(loadQuestion('multiple-choice.html')) as Record<string, unknown>;
    expect(JSON.stringify(fp)).not.toContain('ab12cd34');
  });
});

describe('fingerprint (single question) — reports the selectors reader.ts depends on', () => {
  it('reports presence + counts for a fully-readable MC question', () => {
    const fp = fingerprint(loadQuestion('multiple-choice.html')) as Record<string, unknown>;
    // dialog container (root the reader is handed)
    expect(fp.hasDialogContainer).toBe(true);
    // header <h4> carrying "Question ID: ……" (reader reads the id here, not from whole modal)
    expect(fp.hasHeaderH4).toBe(true);
    expect(fp.hasQuestionId).toBe(true);
    // taxonomy meta table + its data row (the <tr> with <td>s)
    expect(fp.hasTaxonomyTable).toBe(true);
    expect(fp.taxonomyDataCellCount).toBe(5); // Assessment, Section, Domain, Skill, Difficulty
    // stem node
    expect(fp.hasStemNode).toBe(true);
    // MC answer choices: .answer-choices ul > li
    expect(fp.answerChoiceCount).toBe(4);
    // revealed rationale (holds "Correct Answer: …")
    expect(fp.hasRationale).toBe(true);
  });

  it('grid-in: a stem but ZERO answer choices (still a valid read)', () => {
    const fp = fingerprint(loadQuestion('grid-in.html')) as Record<string, unknown>;
    expect(fp.hasDialogContainer).toBe(true);
    expect(fp.hasQuestionId).toBe(true);
    expect(fp.hasStemNode).toBe(true);
    expect(fp.answerChoiceCount).toBe(0); // grid-in has no .answer-choices list
    expect(fp.hasRationale).toBe(true);
  });

  it('image-choice: still counts 4 answer-choice <li> even when each holds only an <img>', () => {
    const fp = fingerprint(loadQuestion('image-choice.html')) as Record<string, unknown>;
    expect(fp.answerChoiceCount).toBe(4);
    expect(fp.hasStemNode).toBe(true);
  });
});

describe('fingerprint (single question) — detects DRIFT', () => {
  it('flips hasDialogContainer false when CB renames the dialog container', () => {
    // Drift: CB ships ".cb-dialog-wrapper" instead of ".cb-dialog-container". The reader would get
    // null; the fingerprint must register the structural break.
    document.body.innerHTML = readFixture('multiple-choice.html').replace(
      /cb-dialog-container/g,
      'cb-dialog-wrapper',
    );
    const root = document.querySelector('.cb-dialog-wrapper')!;
    const fp = fingerprint(root) as Record<string, unknown>;
    expect(fp.hasDialogContainer).toBe(false);
  });

  it('answerChoiceCount goes 0 when the .answer-choices list disappears', () => {
    // Drift: CB renames ".answer-choices" -> ".answer-options". The reader yields zero choices;
    // the fingerprint count must drop to 0 to flag the break.
    document.body.innerHTML = readFixture('multiple-choice.html').replace(
      /answer-choices/g,
      'answer-options',
    );
    const fp = fingerprint(document.querySelector('.cb-dialog-container')!) as Record<string, unknown>;
    expect(fp.answerChoiceCount).toBe(0);
  });

  it('flips hasTaxonomyTable false when CB renames table.cb-table', () => {
    document.body.innerHTML = readFixture('multiple-choice.html').replace(
      /class="cb-table"/g,
      'class="cb-meta-grid"',
    );
    const fp = fingerprint(document.querySelector('.cb-dialog-container')!) as Record<string, unknown>;
    expect(fp.hasTaxonomyTable).toBe(false);
  });

  it('flips hasRationale false before the answer is revealed', () => {
    // Pre-reveal: no .rationale node yet (CB injects it on "Show correct answer and explanation").
    document.body.innerHTML =
      '<div class="cb-dialog-container"><div class="cb-dialog-header"><h4>Question ID: ab12cd34</h4></div>' +
      '<div class="answer-content"><div class="answer-choices"><ul><li>3</li><li>5</li></ul></div></div></div>';
    const fp = fingerprint(document.querySelector('.cb-dialog-container')!) as Record<string, unknown>;
    expect(fp.hasRationale).toBe(false);
    expect(fp.hasQuestionId).toBe(true);
    expect(fp.answerChoiceCount).toBe(2);
  });

  it('flips hasQuestionId false when the header has no "Question ID" token', () => {
    document.body.innerHTML =
      '<div class="cb-dialog-container"><div class="cb-dialog-header"><h4>loading…</h4></div></div>';
    const fp = fingerprint(document.querySelector('.cb-dialog-container')!) as Record<string, unknown>;
    expect(fp.hasQuestionId).toBe(false);
  });
});

describe('fingerprintList (results list) — content-free + drift', () => {
  it('returns ONLY primitives and leaks NO row text', () => {
    const fp = fingerprintList(loadList()) as Record<string, unknown>;
    assertContentFree(fp);
    // the bare row ids are not part of the structure signal
    expect(JSON.stringify(fp)).not.toContain('ab12cd34');
  });

  it('reports the results table presence + row counts reader depends on', () => {
    const fp = fingerprintList(loadList()) as Record<string, unknown>;
    expect(fp.hasResultsTable).toBe(true);      // table.cb-table-react
    expect(fp.bodyRowCount).toBe(4);            // 3 result rows + 1 loading row in <tbody>
    expect(fp.idBearingRowCount).toBe(3);       // rows whose .id-column holds an 8-hex id
  });

  it('flips hasResultsTable false + zeroes id rows when CB renames the results table', () => {
    document.body.innerHTML = readFixture('results-list.html').replace(
      /cb-table-react/g,
      'cb-table-grid',
    );
    const fp = fingerprintList(document.querySelector('.results-page')!) as Record<string, unknown>;
    expect(fp.hasResultsTable).toBe(false);
    expect(fp.idBearingRowCount).toBe(0);
  });
});
