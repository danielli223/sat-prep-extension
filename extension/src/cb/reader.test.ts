import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readQuestion } from './reader';

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
