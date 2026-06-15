import { describe, it, expect } from 'vitest';
import { deriveStats } from './stats';
import { makeAttempt } from './model';

function att(questionId: string, skill: string, correct: boolean, createdAt: string) {
  return { ...makeAttempt({ deviceId: 'd', questionId, section: 'Math', domain: 'Algebra', skill, difficulty: 'Hard', pick: 'B', correct }), createdAt };
}

describe('deriveStats', () => {
  it('uses the latest attempt per question and sorts skills worst-first', () => {
    const stats = deriveStats([
      att('q1', 'Inferences', false, '2026-06-10T00:00:00Z'),
      att('q1', 'Inferences', true,  '2026-06-12T00:00:00Z'), // latest wins → correct
      att('q2', 'Inferences', false, '2026-06-11T00:00:00Z'),
      att('q3', 'Linear equations', true, '2026-06-11T00:00:00Z'),
    ]);
    expect(stats.total).toBe(3);
    expect(stats.correct).toBe(2);
    expect(stats.perSkill[0]!.skill).toBe('Inferences'); // 1/2 = 50% worst
    expect(stats.perSkill[0]!.accuracy).toBeCloseTo(0.5);
    expect(stats.seen.q2).toBe('missed');
    expect(stats.seen.q1).toBe('done');
  });

  it('ignores tombstoned attempts', () => {
    const a = att('q1', 'X', true, '2026-06-10T00:00:00Z');
    const stats = deriveStats([{ ...a, deleted: true }]);
    expect(stats.total).toBe(0);
  });

  it('computes consecutive-day streak ending at the most recent active day', () => {
    const s = deriveStats([
      att('q1', 'X', true, '2026-06-13T10:00:00Z'),
      att('q2', 'X', true, '2026-06-12T10:00:00Z'),
      att('q3', 'X', true, '2026-06-11T10:00:00Z'),
      att('q4', 'X', true, '2026-06-08T10:00:00Z'), // gap → streak stops at 3
    ]);
    expect(s.streakDays).toBe(3);
  });
});
