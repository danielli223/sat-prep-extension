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

  // stemHtml renders CB's stem markup so tables paint as real tables (a table-bearing stem flattened
  // to a run-on text blob before this; live 2026-06-16). It is a strict allowlist — the ONLY place CB
  // HTML is rendered un-escaped — so these tests double as the XSS contract.
  it('preserves a stem table as real <table> markup with its cell values', () => {
    document.body.innerHTML =
      '<div class="cb-dialog-container"><div class="cb-dialog-header"><h4>Question ID: ab12cd34</h4></div>' +
      '<div class="cb-dialog-content"><div class="question-content">' +
      '<div class="question">For the table below: [SYNTHETIC]' +
      '<figure class="table"><table><thead><tr><th>x</th><th>y</th></tr></thead>' +
      '<tbody><tr><td>1</td><td>13</td></tr><tr><td>2</td><td>k</td></tr></tbody></table></figure>' +
      '</div></div></div></div>';
    const v = readQuestion(document.querySelector('.cb-dialog-container')!)!;
    expect(v.stemHtml).toContain('<table>');
    expect(v.stemHtml).toContain('<td>13</td>');
    expect(v.stemHtml).toContain('<td>k</td>');
    expect(v.stemHtml).toContain('For the table below');
    // <figure> isn't in the allowlist → unwrapped, but the <table> it held survives.
    expect(v.stemHtml).not.toContain('<figure');
  });

  it('strips scripts, event handlers, and all attributes from stem HTML (XSS contract)', () => {
    document.body.innerHTML =
      '<div class="cb-dialog-container"><div class="cb-dialog-header"><h4>Question ID: ab12cd34</h4></div>' +
      '<div class="cb-dialog-content"><div class="question-content">' +
      '<div class="question">Solve: [SYNTHETIC]' +
      '<script>steal()</script>' +
      '<img src="x" onerror="steal()">' +
      '<p onclick="steal()" style="color:red" class="x">value <b>13</b></p>' +
      '<a href="javascript:steal()">link</a>' +
      '</div></div></div></div>';
    const v = readQuestion(document.querySelector('.cb-dialog-container')!)!;
    expect(v.stemHtml).not.toContain('steal');
    expect(v.stemHtml).not.toContain('onerror');
    expect(v.stemHtml).not.toContain('onclick');
    expect(v.stemHtml).not.toContain('javascript:');
    expect(v.stemHtml).not.toContain('style=');
    expect(v.stemHtml).not.toContain('class=');
    expect(v.stemHtml).not.toContain('<script');
    expect(v.stemHtml).not.toContain('<img');
    // structural <p>/<b> and their text survive — the markup is rendered, just disarmed.
    expect(v.stemHtml).toContain('<p>value <b>13</b></p>');
  });

  it('flattens embedded MathJax to its plain value in stem HTML (no mjx-container markup)', () => {
    document.body.innerHTML =
      '<div class="cb-dialog-container"><div class="cb-dialog-header"><h4>Question ID: ab12cd34</h4></div>' +
      '<div class="cb-dialog-content"><div class="question-content">' +
      '<div class="question">If <mjx-container><mjx-math><style>mjx{}</style>k</mjx-math></mjx-container>' +
      ' is constant [SYNTHETIC]</div></div></div></div>';
    const v = readQuestion(document.querySelector('.cb-dialog-container')!)!;
    expect(v.stemHtml).not.toContain('mjx-container');
    expect(v.stemHtml).not.toContain('<style');
    expect(v.stemHtml).toContain('If k');
    expect(v.stemHtml).toContain('is constant');
  });

  it('drops CB\'s section/difficulty <h5> labels from the stem (no "MathDifficulty:" leak)', () => {
    // The .question-content also holds CB's own <h5> chrome. The live "MathDifficulty: Hard" leak came
    // from flattening the WHOLE container; the stem must be only the .question body.
    document.body.innerHTML =
      '<div class="cb-dialog-container"><div class="cb-dialog-header"><h4>Question ID: ab12cd34</h4></div>' +
      '<div class="cb-dialog-content"><div class="question-content">' +
      '<h5 class="text">Math</h5><h5>Difficulty: Hard</h5>' +
      '<div class="prompt"></div>' +
      '<div class="question">What is x? [SYNTHETIC]</div></div></div></div>';
    const v = readQuestion(document.querySelector('.cb-dialog-container')!)!;
    expect(v.stemHtml).not.toContain('Difficulty:');
    expect(v.stemHtml).not.toContain('Math<');
    expect(v.stemHtml).toContain('What is x?');
    expect(v.stem).not.toContain('Difficulty:');
    expect(v.stem).not.toContain('Math');
  });

  it('no longer exposes explanation fields (CB renders its rationale natively)', () => {
    const v = readQuestion(load('multiple-choice.html'))! as unknown as Record<string, unknown>;
    expect(v.explanation).toBeUndefined();
    expect(v.explanationHtml).toBeUndefined();
    expect(v.correctAnswer).toBe('B');   // still read for scoring
  });
});
