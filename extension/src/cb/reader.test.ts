import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readQuestion } from './reader';

const here = dirname(fileURLToPath(import.meta.url));
const load = (name: string) => {
  document.body.innerHTML = readFileSync(join(here, '__fixtures__', name), 'utf8');
  return document.querySelector('[role="dialog"]')!;
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
    document.body.innerHTML = '<div role="dialog">loading…</div>';
    expect(readQuestion(document.querySelector('[role="dialog"]')!)).toBeNull();
  });

  it('captures a multi-value grid-in correct answer verbatim (scoring parses the forms)', () => {
    document.body.innerHTML =
      '<div role="dialog"><div>Question ID: aa11bb22</div><div class="correct-answer">Correct Answer: 1/3, .333, .3333</div></div>';
    expect(readQuestion(document.querySelector('[role="dialog"]')!)!.correctAnswer).toBe('1/3, .333, .3333');
  });
});
