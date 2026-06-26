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

  // FAIL SAFE (invariant #6): the fragile src/cb/ layer must DEGRADE on unexpected CB markup, never
  // throw. The fixed-arity MathML parsers index required children (mfrac child[0..1], msup child[0..1],
  // msubsup child[0..2]). If CB ever emits one of these with FEWER children than required, the parser
  // must not call parseMathEl(undefined) and crash — readQuestion runs with NO try/catch in observer.ts,
  // so a throw here suppresses the whole overlay for that question.
  it('degrades on malformed fixed-arity MathML (too few children) instead of throwing', () => {
    // [SYNTHETIC] malformed MathML: <mfrac>/<msup> with one child, <msubsup> with two. Fabricated —
    // never real CB content. Wrapped in the minimal dialog/header/answer-choices shape readQuestion needs.
    document.body.innerHTML =
      '<div class="cb-dialog-container"><div class="cb-dialog-header"><h4>Question ID: dd44ee55</h4></div>' +
      '<div class="answer-content"><div class="answer-choices"><ul><li>' +
      '<math>' +
      '<mfrac><mn>7</mn></mfrac>' +              // arity 2, only 1 child
      '<msup><mi>z</mi></msup>' +                // arity 2, only 1 child
      '<msubsup><mi>k</mi><mn>9</mn></msubsup>' +// arity 3, only 2 children
      '</math>' +
      '</li></ul></div></div></div>';
    const el = document.querySelector('.cb-dialog-container')!;

    // The bug: parseMathEl(kids[1]) / parseMathEl(kids[2]) on missing children does
    // [...undefined.children] → TypeError, which (no try/catch upstream) kills the whole read.
    expect(() => readQuestion(el)).not.toThrow();

    const v = readQuestion(el);
    expect(v).not.toBeNull();
    const c = v!.choices[0]!;
    // Degraded gracefully: the choice still has a defined math AST (a row/partial), not a crash.
    expect(c.math).toBeDefined();
    // And the readable leaf values that WERE present still survive somewhere (AST or text fallback).
    const survives = flat(c.math) + c.text;
    expect(survives).toContain('7');
    expect(survives).toContain('z');
    expect(survives).toContain('k');
    expect(survives).toContain('9');
  });
});

// Issue #80 — MathML answer choices whose PARENTHESES are carried by <mfenced> (open/close/separators
// ATTRIBUTES) lose their parens: 2xy(8x²y + 7) renders as 2xy8x²y+7. parseMathEl has no `mfenced` case,
// so it falls through to `default → row(parseChildren)`, which walks only child ELEMENTS and discards
// the attribute-carried fences. The fix adds a `case 'mfenced'` that emits open + children (interleaved
// with separators) + close as text/row — NO new MathNode kind (text+row already express fences). The
// fixture is SYNTHETIC (fabricated MathML, per CLAUDE.md). Reuses the load()/flat()/collect() helpers.
describe('readQuestion — <mfenced> parentheses in answer choices (#80)', () => {
  const choices = () => readQuestion(load('math-fenced-choice.html'))!.choices;

  it('reads the question cleanly when choices carry <mfenced> MathML', () => {
    const v = readQuestion(load('math-fenced-choice.html'))!;
    expect(v.id).toBe('fe09ab12');
    expect(v.section).toBe('Math');
    expect(v.choices.map((c) => c.letter)).toEqual(['A', 'B', 'C', 'D']);
    expect(v.correctAnswer).toBe('A');
  });

  it('keeps the <mfenced> parentheses AROUND the inner expression (the bug: they were dropped)', () => {
    const c = choices()[0]!;   // 2xy(8x²y + 7)
    expect(c.math).toBeDefined();
    const s = flat(c.math);
    // The default fences are "(" and ")"; they must surround the inner 8…7 expression.
    expect(s).toContain('(');
    expect(s).toContain(')');
    // Specifically the parens wrap the inner row: "(" comes before the inner content and ")" after it.
    expect(s).toMatch(/\(.*8.*7.*\)/);
  });

  it('keeps the inner <msup> superscript intact alongside the restored fences (only parens were lost)', () => {
    const c = choices()[0]!;   // 2xy(8x²y + 7)
    // The msup (x²) inside the fenced expression must still parse to a `sup` node — the fix restores the
    // parens WITHOUT flattening the superscript that already worked.
    const sups = collect(c.math, 'sup');
    expect(sups.length).toBeGreaterThanOrEqual(1);
    expect(sups.map((s) => (s.kind === 'sup' ? flat(s.sup) : ''))).toContain('2');
  });

  it('honors explicit open/close attributes and interleaves the separator: [a;b]', () => {
    const c = choices()[1]!;   // <mfenced open="[" close="]" separators=";"> a b
    const s = flat(c.math);
    expect(s).toContain('[');
    expect(s).toContain(']');
    expect(s).toContain('a');
    expect(s).toContain('b');
    // The separator goes BETWEEN the two children: "[a;b]".
    expect(s).toContain(';');
    expect(s.replace(/\s+/g, '')).toBe('[a;b]');
  });

  it('recurses into a nested <mfenced>: ((x)) — doubled parens', () => {
    const c = choices()[2]!;   // <mfenced><mfenced><mi>x</mi></mfenced></mfenced>
    const s = flat(c.math).replace(/\s+/g, '');
    expect(s).toContain('((');
    expect(s).toContain('))');
    expect(s).toBe('((x))');
  });

  it('regression-lock: parens supplied by fence OPERATORS <mo>(</mo>…<mo>)</mo> already render (passes pre- and post-fix)', () => {
    const c = choices()[3]!;   // <mo>(</mo> n + 1 <mo>)</mo>
    const s = flat(c.math);
    // mo → text already, so this never depended on the mfenced fix — it must hold both before and after.
    expect(s).toContain('(');
    expect(s).toContain(')');
    expect(s.replace(/\s+/g, '')).toBe('(n+1)');
  });

  it('does NOT leak the raw <annotation> TeX (\\left( … \\right)) into the AST', () => {
    for (const c of choices()) {
      expect(flat(c.math)).not.toContain('\\left');
      expect(flat(c.math)).not.toContain('\\right');
    }
  });
});

// Live Question Bank (verified over CDP 2026-06-25): for EXPRESSION choices, CB renders math via
// MathJax v3 — a visual SVG glyph layer in <mjx-container> with the semantic <math> in an
// <mjx-assistive-mml> nested as a CHILD of that same <mjx-container>. The old reader removed the whole
// <mjx-container> before reading, deleting the nested <math> with it (live probe: 0 <math> survived) →
// empty AST → the raw-textContent fallback rendered the flattened glyph string (e.g. "m4q20z-3"). The
// reader must read the <math> element(s) directly. The glyph layer carries a GARBLE token so a test
// proves we read the SEMANTIC tree, never the visual glyphs.
describe('readQuestion — MathJax <math> nested INSIDE <mjx-container> (verified live 2026-06-25)', () => {
  const nested =
    '<div class="cb-dialog-container"><div class="cb-dialog-header"><h4>Question ID: cc33dd44</h4></div>' +
    '<div class="answer-content"><div class="answer-choices"><ul><li><div><p>' +
    '<mjx-container class="MathJax" jax="SVG">' +
    '<svg><mjx-math aria-hidden="true">GARBLEm4q20z3</mjx-math></svg>' +
    '<mjx-assistive-mml unselectable="on" display="inline">' +   /* CHILD of mjx-container — the live shape */
    '<math xmlns="http://www.w3.org/1998/Math/MathML"><semantics><mrow>' +
    '<msup><mi>m</mi><mn>4</mn></msup>' +
    '<msup><mi>q</mi><mn>20</mn></msup>' +
    '<msup><mi>z</mi><mrow><mo>&#x2212;</mo><mn>3</mn></mrow></msup>' +
    '</mrow><annotation encoding="application/x-tex">m^4q^{20}z^{-3}</annotation></semantics></math>' +
    '</mjx-assistive-mml>' +
    '</mjx-container>' +
    '</p></div></li></ul></div></div></div>';

  it('parses the exponents even though <math> is a CHILD of <mjx-container>', () => {
    document.body.innerHTML = nested;
    const c = readQuestion(document.querySelector('.cb-dialog-container')!)!.choices[0]!;
    expect(c.math).toBeDefined();
    const sups = collect(c.math, 'sup');
    expect(sups.length).toBeGreaterThanOrEqual(3);   // m^4, q^20, z^-3
    expect(sups.map((s) => (s.kind === 'sup' ? flat(s.sup) : ''))).toContain('20');
  });

  it('reads the semantic tree, never the garbled visual glyph layer', () => {
    document.body.innerHTML = nested;
    const c = readQuestion(document.querySelector('.cb-dialog-container')!)!.choices[0]!;
    expect(flat(c.math)).not.toContain('GARBLE');
    expect(c.text).not.toContain('GARBLE');
  });
});

// Live Question Bank (observed 2026-06-25): CB renders choice math as inline <img class="math-img">
// (self-contained data:image/png), NOT MathJax. A choice that pairs two expressions is an ORDERED
// sequence "[img] and [img]" inside p.choice_paragraph. The reader only captured a lone <img> (when the
// <li> had NO text); here the literal " and " makes textContent non-empty, so the choice fell through to
// plain text = "and", dropping BOTH images. The reader must capture the ordered parts so the overlay can
// render every image + the connective.
describe('readQuestion — image-based multi-part answer choices ["[img] and [img]"]', () => {
  const choices = () => readQuestion(load('math-img-choice.html'))!.choices;

  it('reads four lettered choices and the revealed correct answer', () => {
    const v = readQuestion(load('math-img-choice.html'))!;
    expect(v.id).toBe('7f81d0c3');
    expect(v.section).toBe('Math');
    expect(v.choices.map((c) => c.letter)).toEqual(['A', 'B', 'C', 'D']);
    expect(v.correctAnswer).toBe('C');
  });

  it('captures the ordered parts [img, "and", img] — not just the connective "and"', () => {
    const parts = choices()[0]!.parts;
    expect(parts).toBeDefined();
    expect(parts!.map((p) => p.kind)).toEqual(['img', 'text', 'img']);
    const texts = parts!.filter((p) => p.kind === 'text') as Array<{ value: string }>;
    expect(texts.map((p) => p.value)).toEqual(['and']);
  });

  it('each img part carries the inline data:image src and its alt', () => {
    const imgs = choices()[0]!.parts!.filter((p) => p.kind === 'img') as Array<{ src: string; alt: string }>;
    expect(imgs).toHaveLength(2);
    expect(imgs[0]!.src).toMatch(/^data:image\/png/);
    expect(imgs[0]!.alt).toBe('p equals 1');
    expect(imgs[1]!.alt).toBe('p equals 4');
  });

  it('sets a meaningful text fallback (both alts + connective), not just "and"', () => {
    const c = choices()[0]!;
    expect(c.text).toContain('p equals 1');
    expect(c.text).toContain('p equals 4');
    expect(c.text).toContain('and');
    expect(c.text).not.toBe('and');
  });

  it('regression: a lone-image choice (no connective) still uses imgSrc, not parts', () => {
    const v = readQuestion(load('image-choice.html'))!;
    expect(v.choices.every((c) => c.parts === undefined)).toBe(true);
    expect(v.choices[0]!.imgSrc).toBe('https://example-cb.org/img/choice-a.png');
  });
});

// Issue #36: parabola questions render each answer choice as an inline <svg> graph. The choice
// reader read raw li.textContent, leaking the SVG's <style> CSS, its <title>/<desc> a11y prose,
// and MathJax-verbalized math into choice.text. The fix must (1) strip that noise from the text and
// (2) surface the real graph via choice.imgSrc as a serialized data:image/svg+xml URL (the overlay
// renders imgSrc as an inert <img>). Synthetic fixture only; no LLM, no CB network.
describe('readQuestion — inline-SVG (parabola) answer choices [issue #36]', () => {
  it('reads four lettered choices A–D from the SVG-choice fixture', () => {
    const v = readQuestion(load('svg-choice.html'))!;
    expect(v.choices).toHaveLength(4);
    expect(v.choices.map((c) => c.letter)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('does NOT leak the SVG <style> CSS into choice.text', () => {
    const v = readQuestion(load('svg-choice.html'))!;
    for (const c of v.choices) {
      expect(c.text).not.toContain('stroke-linecap');
      expect(c.text).not.toContain('*{');
    }
  });

  it('does NOT leak the <desc>/<title> graph prose or verbalized math into choice.text', () => {
    const v = readQuestion(load('svg-choice.html'))!;
    for (const c of v.choices) {
      expect(c.text).not.toContain('The parabola opens upward');
      expect(c.text).not.toContain('StartFraction');
      expect(c.text).not.toContain('EndFraction');
    }
  });

  it('surfaces each inline-SVG graph as a data:image/svg+xml imgSrc', () => {
    const v = readQuestion(load('svg-choice.html'))!;
    for (const c of v.choices) {
      expect(c.imgSrc).toBeDefined();
      expect(c.imgSrc!).toMatch(/^data:image\/svg\+xml/);
    }
  });

  it('strips inert <script> nodes out of the serialized SVG imgSrc (safety)', () => {
    const v = readQuestion(load('svg-choice.html'))!;
    for (const c of v.choices) {
      // Safety is only meaningful once the graph is actually surfaced as a data: URL.
      expect(c.imgSrc).toBeDefined();
      const imgSrc = c.imgSrc!;
      // The serialized SVG (raw or URL/base64-encoded) must never carry a <script> element.
      expect(imgSrc).not.toContain('<script');
      expect(decodeURIComponent(imgSrc)).not.toContain('<script');
    }
  });

  it('still reads the correct answer from the rationale', () => {
    const v = readQuestion(load('svg-choice.html'))!;
    expect(v.correctAnswer).toBe('B');
  });
});

// Issue #55 — STUDENT bank (mypractice.collegeboard.org/questionbank/results).
// CHARACTERIZATION: the student bank shares the entire INNER question DOM with the
// educator bank, so `readQuestion` should work unchanged when handed the student modal
// root (`.cb-modal-container`, the [role=dialog]). These tests prove the shared-DOM
// thesis and LOCK reader.ts against a regression once the maker generalizes the root.
// If any of these ever fail, reader.ts has actually diverged for the student shape and
// the maker must address it (the spec's "reader.ts needs no change" claim is wrong).
const loadStudent = (name: string) => {
  document.body.innerHTML = readFileSync(join(here, '__fixtures__', name), 'utf8');
  return document.querySelector('.cb-modal-container')!;
};

describe('readQuestion — student bank (.cb-modal-container root)', () => {
  it('reads a student multiple-choice question (revealed)', () => {
    const v = readQuestion(loadStudent('student-mc.html'))!;
    expect(v).not.toBeNull();
    expect(v.id).toBe('ab12cd34');
    // Taxonomy is read by COLUMN position [Assessment, Section, Domain, Skill, Difficulty].
    expect(v.section).toBe('Reading and Writing');
    expect(v.domain).toBe('Information and Ideas');
    expect(v.skill).toBe('Central Ideas and Details');
    expect(v.difficulty).toBe('Medium');
    // Letters are derived from <li> index; four bare choices → A,B,C,D.
    expect(v.choices.map((c) => c.letter)).toEqual(['A', 'B', 'C', 'D']);
    expect(v.choices.map((c) => c.text)).toEqual([
      'Alpha placeholder choice [SYNTHETIC]',
      'Bravo placeholder choice [SYNTHETIC]',
      'Charlie placeholder choice [SYNTHETIC]',
      'Delta placeholder choice [SYNTHETIC]',
    ]);
    // Stem text is read (CB's <h5> "Reading and Writing"/"Difficulty:" chrome must NOT leak in).
    expect(v.stem).toBe('Lorem ipsum dolor sit amet placeholder stem. [SYNTHETIC]');
    expect(v.stem).not.toMatch(/Difficulty/);
    // Correct answer comes from the injected `.rationale` (present in this revealed fixture).
    expect(v.correctAnswer).toBe('B');
  });

  it('reads a student grid-in question (no choices, numeric answer)', () => {
    const v = readQuestion(loadStudent('student-grid-in.html'))!;
    expect(v).not.toBeNull();
    expect(v.id).toBe('ef56ab78');
    expect(v.section).toBe('Math');
    expect(v.domain).toBe('Algebra');
    expect(v.skill).toBe('Linear equations in two variables');
    expect(v.difficulty).toBe('Hard');
    expect(v.choices).toHaveLength(0);
    expect(v.correctAnswer).toBe('5');
  });
});
