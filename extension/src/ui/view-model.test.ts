import { describe, it, expect } from 'vitest';
import { toCardVM, type CardVM } from './view-model';
import type { QuestionView, MathNode } from '../cb/reader';
import { assertNoQuestionContent } from '../guard';

const mc: QuestionView = {
  id: 'ab12cd34', section: 'Math', domain: 'Algebra', skill: 'Linear equations in one variable',
  difficulty: 'Hard', stem: 'STEM TEXT — must not leak',
  choices: [
    { letter: 'A', text: '3' }, { letter: 'B', text: '5' }, { letter: 'C', text: '7' }, { letter: 'D', text: '15' },
  ], correctAnswer: 'B',
};

describe('toCardVM', () => {
  it('carries IDs/taxonomy/choices and the position header', () => {
    const vm = toCardVM(mc, 0, 10);
    expect(vm.id).toBe('ab12cd34');
    expect(vm.skill).toBe('Linear equations in one variable');
    expect(vm.difficulty).toBe('Hard');
    expect(vm.choices.map((c) => c.letter)).toEqual(['A', 'B', 'C', 'D']);
    expect(vm.position).toEqual({ index: 1, total: 10 });   // 1-based "Q 1 of 10"
    expect(vm.answerKnown).toBe(true);
    expect(vm.kind).toBe('mc');
  });

  it('NEVER carries stem text (RAM-only stem stays out of the VM)', () => {
    const vm = toCardVM(mc, 0, 1);
    const json = JSON.stringify(vm);
    expect(json).not.toContain('STEM TEXT');
    expect((vm as Record<string, unknown>).stem).toBeUndefined();
  });

  it('marks a grid-in question (no choices) with kind "grid"', () => {
    const grid: QuestionView = { ...mc, id: 'ef56ab78', choices: [], correctAnswer: '5' };
    expect(toCardVM(grid, 2, 4).kind).toBe('grid');
  });

  it('sets answerKnown=false when CB has not revealed the answer yet', () => {
    expect(toCardVM({ ...mc, correctAnswer: null }, 0, 1).answerKnown).toBe(false);
  });

  it('threads a choice math AST through (RAM-only, like imgSrc)', () => {
    const math: MathNode = { kind: 'frac', num: { kind: 'text', value: '1' }, den: { kind: 'text', value: 'x' } };
    const withMath: QuestionView = {
      ...mc,
      choices: [{ letter: 'A', text: '1/x', math }, { letter: 'B', text: '5' }],
    };
    const vm = toCardVM(withMath, 0, 10);
    expect(vm.choices[0]!.math).toEqual(math);
    expect(vm.choices[1]!.math).toBeUndefined();
  });

  it('math stays RAM-only: stem undefined, and choice content never reaches the store leak-guard', () => {
    const math: MathNode = { kind: 'frac', num: { kind: 'text', value: '−150v' }, den: { kind: 'text', value: 'x' } };
    const withMath: QuestionView = {
      ...mc, stem: 'STEM TEXT — must not leak',
      choices: [{ letter: 'A', text: 'w=-150v/x', math }],
    };
    const vm = toCardVM(withMath, 0, 1);
    // Leak-guard: the VM never carries the stem.
    expect((vm as Record<string, unknown>).stem).toBeUndefined();
    // The math AST does not smuggle question content into a store-bound record: the guard's
    // allowed keys do not include `math`/`choices`/`text`-as-choice, so any attempt to persist a
    // record built from these fields throws. Build a record with the math-bearing choice fields and
    // assert the store guard rejects it (math is RAM-only, never an attempt key).
    expect(() => assertNoQuestionContent({ questionId: vm.id, math } as Record<string, unknown>)).toThrow();
    expect(() => assertNoQuestionContent({ questionId: vm.id, choices: vm.choices } as Record<string, unknown>)).toThrow();
  });
});
