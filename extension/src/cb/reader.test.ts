import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readQuestion, type MathNode } from './reader';

const here = dirname(fileURLToPath(import.meta.url));
const load = (name: string) => {
  document.body.innerHTML = readFileSync(join(here, '__fixtures__', name), 'utf8');
  return document.querySelector('.cb-dialog-container')!;
};

describe('readQuestion', () => {
  it('reads a multiple-choice question', () => {
    const v = readQuestion(load('multiple-choice.html'))!;
    expect(v.id).toBe('ab12cd34');
    expect(v.section).toBe('Math');
    expect(v.domain).toBe('Algebra');
    expect(v.skill).toBe('Linear equations in one variable');
    expect(v.difficulty).toBe('Hard');
    expect(v.choices.map((c) => c.letter)).toEqual(['A', 'B', 'C', 'D']);
    expect(v.correctAnswer).toBe('B');
  });

  it('reads a grid-in question (no choices, numeric answer)', () => {
    const v = readQuestion(load('grid-in.html'))!;
    expect(v.id).toBe('ef56ab78');
    expect(v.choices).toHaveLength(0);
    expect(v.correctAnswer).toBe('5');
  });

  it('returns null when there is no Question ID present', () => {
    document.body.innerHTML = '<div class="cb-dialog-container">loading…</div>';
    expect(readQuestion(document.querySelector('.cb-dialog-container')!)).toBeNull();
  });

  it('reads the id from the header <h4>, ignoring an adjacent Copy control', () => {
    // The whole-modal text would be "Question ID: ab12cd34Copy…" → a naive [0-9a-f]{6,} match yields
    // "ab12cd34C" (C is hex). Reading the <h4> with a fixed 8-hex capture must give the clean id.
    document.body.innerHTML =
      '<div class="cb-dialog-container"><div class="cb-dialog-header">' +
      '<h4>Question ID: ab12cd34</h4><button>Copy</button></div></div>';
    expect(readQuestion(document.querySelector('.cb-dialog-container')!)!.id).toBe('ab12cd34');
  });

  it('returns correctAnswer null before the rationale is revealed (choices still present)', () => {
    document.body.innerHTML =
      '<div class="cb-dialog-container"><div class="cb-dialog-header"><h4>Question ID: ab12cd34</h4></div>' +
      '<div class="answer-content"><div class="answer-choices"><ul><li>3</li><li>5</li></ul></div></div></div>';
    const v = readQuestion(document.querySelector('.cb-dialog-container')!)!;
    expect(v.correctAnswer).toBeNull();
    expect(v.choices).toHaveLength(2);
  });

  it('captures a multi-value grid-in correct answer verbatim (scoring parses the forms)', () => {
    document.body.innerHTML =
      '<div class="cb-dialog-container"><div class="cb-dialog-header"><h4>Question ID: aa11bb22</h4></div>' +
      '<div class="rationale"><p class="cb-font-weight-bold">Correct Answer: 1/3, .333, .3333</p>' +
      '<div>explanation</div></div></div>';
    expect(readQuestion(document.querySelector('.cb-dialog-container')!)!.correctAnswer).toBe('1/3, .333, .3333');
  });

  it('strips MathJax <style>/<script> noise out of the stem (RAM-only spotlight)', () => {
    document.body.innerHTML =
      '<div class="cb-dialog-container"><div class="cb-dialog-header"><h4>Question ID: ab12cd34</h4></div>' +
      '<div class="cb-dialog-content"><div class="question-content">' +
      '<style>*{stroke-linecap:butt;stroke-linejoin:round;}</style>' +
      '<div class="question">If 3x = 9, what is x? [SYNTHETIC]</div></div></div></div>';
    const v = readQuestion(document.querySelector('.cb-dialog-container')!)!;
    expect(v.stem).not.toContain('stroke-linecap');
    expect(v.stem).toContain('If 3x = 9');
  });

  it('no longer exposes stemHtml, but still reads plain stem text (observer dedup needs it)', () => {
    const v = readQuestion(load('multiple-choice.html'))! as unknown as Record<string, unknown>;
    expect(v.stemHtml).toBeUndefined();
    expect(typeof v.stem).toBe('string');
    expect((v.stem as string).length).toBeGreaterThan(0);
  });

  it('no longer exposes explanation fields (CB renders its rationale natively)', () => {
    const v = readQuestion(load('multiple-choice.html'))! as unknown as Record<string, unknown>;
    expect(v.explanation).toBeUndefined();
    expect(v.explanationHtml).toBeUndefined();
    expect(v.correctAnswer).toBe('B');   // still read for scoring
  });

  it('reads image-based choices: sets imgSrc when <li> has an <img> and no text', () => {
    const v = readQuestion(load('image-choice.html'))!;
    expect(v.choices).toHaveLength(4);
    expect(v.choices.map((c) => c.letter)).toEqual(['A', 'B', 'C', 'D']);
    expect(v.choices[0]!.imgSrc).toBe('https://example-cb.org/img/choice-a.png');
    expect(v.choices[1]!.imgSrc).toBe('https://example-cb.org/img/choice-b.png');
    expect(v.correctAnswer).toBe('A');
  });

  it('does not set imgSrc when choices have text content', () => {
    const v = readQuestion(load('multiple-choice.html'))!;
    expect(v.choices.every((c) => c.imgSrc === undefined)).toBe(true);
  });

  it('falls back to img alt as text when present', () => {
    document.body.innerHTML =
      '<div class="cb-dialog-container"><div class="cb-dialog-header"><h4>Question ID: ab12cd34</h4></div>' +
      '<div class="answer-content"><div class="answer-choices"><ul>' +
      '<li><img src="https://cb.org/a.png" alt="x squared" /></li>' +
      '<li><img src="https://cb.org/b.png" alt="" /></li>' +
      '</ul></div></div></div>';
    const v = readQuestion(document.querySelector('.cb-dialog-container')!)!;
    expect(v.choices[0]!.text).toBe('x squared');
    expect(v.choices[0]!.imgSrc).toBe('https://cb.org/a.png');
    expect(v.choices[1]!.text).toBe('');
    expect(v.choices[1]!.imgSrc).toBe('https://cb.org/b.png');
  });

  it('regression: choices WITHOUT a <math> element keep math undefined (image-choice + plain-text fixtures)', () => {
    const plain = readQuestion(load('multiple-choice.html'))!;
    expect(plain.choices.every((c) => c.math === undefined)).toBe(true);
    const img = readQuestion(load('image-choice.html'))!;
    expect(img.choices.every((c) => c.math === undefined)).toBe(true);
  });
});

// Flatten a MathNode to its raw text (no structure) so a test can assert which characters
// were captured from the SEMANTIC tree, independent of the renderer's tag emission.
function flat(n: MathNode | undefined): string {
  if (!n) return '';
  switch (n.kind) {
    case 'text': return n.value;
    case 'row': return n.items.map(flat).join('');
    case 'sup': return flat(n.base) + flat(n.sup);
    case 'sub': return flat(n.base) + flat(n.sub);
    case 'subsup': return flat(n.base) + flat(n.sub) + flat(n.sup);
    case 'frac': return flat(n.num) + flat(n.den);
    case 'sqrt': return flat(n.radicand);
  }
}

// Collect every node of a given kind anywhere in the tree.
function collect(n: MathNode | undefined, kind: MathNode['kind']): MathNode[] {
  if (!n) return [];
  const here = n.kind === kind ? [n] : [];
  const kids =
    n.kind === 'row' ? n.items :
    n.kind === 'sup' ? [n.base, n.sup] :
    n.kind === 'sub' ? [n.base, n.sub] :
    n.kind === 'subsup' ? [n.base, n.sub, n.sup] :
    n.kind === 'frac' ? [n.num, n.den] :
    n.kind === 'sqrt' ? [n.radicand] : [];
  return here.concat(...kids.map((k) => collect(k, kind)));
}

describe('readQuestion — faithful math in answer choices (#35)', () => {
  it('reads the question cleanly when choices carry MathJax/MathML', () => {
    const v = readQuestion(load('math-choice.html'))!;
    expect(v.id).toBe('bc23de45');
    expect(v.section).toBe('Math');
    expect(v.choices.map((c) => c.letter)).toEqual(['A', 'B', 'C', 'D']);
    expect(v.correctAnswer).toBe('A');
  });

  it('parses a fraction choice into a frac node (the bar survives as STRUCTURE, not dropped)', () => {
    const c = readQuestion(load('math-choice.html'))!.choices[0]!;
    expect(c.math).toBeDefined();
    const fracs = collect(c.math, 'frac');
    expect(fracs).toHaveLength(1);
    const frac = fracs[0]!;
    if (frac.kind !== 'frac') throw new Error('expected frac');
    // Numerator carries −150 v ; denominator carries x — structure, not a flattened "−150v x".
    expect(flat(frac.num)).toContain('150');
    expect(flat(frac.num)).toContain('v');
    expect(flat(frac.den)).toBe('x');
  });

  it('reads the minus from the semantic <mo>, not the garbled visual layer (no stray "v" for the sign)', () => {
    const c = readQuestion(load('math-choice.html'))!.choices[0]!;
    const fracs = collect(c.math, 'frac');
    const num = fracs[0]!.kind === 'frac' ? fracs[0]!.num : undefined;
    // The numerator's leading sign is a real minus (− U+2212 or ascii -), NOT a leaked "v" from the
    // MathJax visual glyph layer (mjx-container textContent was the garbled "w=v150vx").
    expect(flat(num)).toMatch(/^[−-]/);
    // And the visual-layer garbage ("w=v150vx") must not appear anywhere in the parsed structure.
    expect(flat(c.math)).not.toContain('v150');
  });

  it('parses an exponent choice into sup/subsup nodes (superscripts survive)', () => {
    const c = readQuestion(load('math-choice.html'))!.choices[1]!;
    expect(c.math).toBeDefined();
    const sups = collect(c.math, 'sup');
    expect(sups.length).toBeGreaterThanOrEqual(3);   // m^4, q^20, z^-3
    // The "20" exponent is preserved as an exponent (not flattened next to the base).
    const supTexts = sups.map((s) => (s.kind === 'sup' ? flat(s.sup) : ''));
    expect(supTexts).toContain('20');
  });

  it('does NOT leak the raw <annotation> TeX into the AST or the text fallback', () => {
    const c = readQuestion(load('math-choice.html'))!.choices[0]!;
    expect(flat(c.math)).not.toContain('\\frac');
    expect(c.text).not.toContain('\\frac');
    expect(c.text).not.toContain('frac{');
  });

  it('sets the text fallback to a CLEANED string (no MathJax visual glyph noise, no TeX)', () => {
    const c = readQuestion(load('math-choice.html'))!.choices[0]!;
    // The visual mjx-container ("w=v150vx") and the annotation TeX must be stripped from the
    // a11y/fallback string.
    expect(c.text).not.toContain('w=v150vx');
    expect(c.text).not.toContain('\\frac');
  });
});
