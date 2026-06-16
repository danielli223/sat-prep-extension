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
});
