import { describe, it, expect } from 'vitest';
import { score } from './scoring';

describe('score', () => {
  it('multiple-choice: case-insensitive letter compare, graded', () => {
    expect(score('B', 'B')).toEqual({ graded: true, correct: true });
    expect(score('b', 'B')).toEqual({ graded: true, correct: true });
    expect(score('C', 'B')).toEqual({ graded: true, correct: false });
  });

  it('grid-in: exact numeric and fraction equivalence', () => {
    expect(score('5', '5')).toEqual({ graded: true, correct: true });
    expect(score('2.5', '5/2')).toEqual({ graded: true, correct: true });
    expect(score('3/6', '1/2')).toEqual({ graded: true, correct: true });
    expect(score('7', '5')).toEqual({ graded: true, correct: false });
  });

  it('grid-in: multiple acceptable forms listed by CB', () => {
    expect(score('.333', '1/3, .333, .3333')).toEqual({ graded: true, correct: true });
    expect(score('.3333', '1/3, .333, .3333')).toEqual({ graded: true, correct: true });
    expect(score('5/2', '2.5 or 5/2')).toEqual({ graded: true, correct: true });
  });

  it('grid-in: accepts SAT round/truncate of a non-terminating decimal (>= 3 digits)', () => {
    expect(score('.333', '1/3')).toEqual({ graded: true, correct: true });   // truncated to fit
    expect(score('.667', '2/3')).toEqual({ graded: true, correct: true });   // rounded to fit
    expect(score('.3', '1/3')).toEqual({ graded: true, correct: false });    // under-filled => wrong
  });

  it('never guesses: indeterminate when the format is unexpected', () => {
    expect(score('', 'B')).toEqual({ graded: false, correct: false });
    expect(score('hello', '5')).toEqual({ graded: false, correct: false });
    expect(score('5', '')).toEqual({ graded: false, correct: false });
  });
});
