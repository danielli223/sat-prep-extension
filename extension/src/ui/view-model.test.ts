import { describe, it, expect } from 'vitest';
import { toCardVM, type CardVM } from './view-model';
import type { QuestionView } from '../cb/reader';

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
});
