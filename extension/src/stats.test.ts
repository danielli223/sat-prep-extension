import { describe, it, expect } from 'vitest';
import { deriveStats } from './stats';
import { makeAttempt } from './model';

function att(questionId: string, skill: string, correct: boolean, createdAt: string) {
  return { ...makeAttempt({ deviceId: 'd', questionId, section: 'Math', domain: 'Algebra', skill, difficulty: 'Hard', pick: 'B', correct }), createdAt };
}

// Like att(), but lets a test set the difficulty explicitly (issue #34 filters by it).
function attD(questionId: string, skill: string, difficulty: string, correct: boolean, createdAt: string) {
  return { ...makeAttempt({ deviceId: 'd', questionId, section: 'Math', domain: 'Algebra', skill, difficulty, pick: 'B', correct }), createdAt };
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

// Issue #34: break weak-area percentages down by difficulty via a multi-select filter.
// deriveStats(attempts, { difficulties }): "no selection = all"; the filter is applied to the
// raw attempts BEFORE the latest-per-question reduction (so a question whose latest attempt is an
// unselected difficulty drops out). Tombstone + latest-attempt rules still hold; a skill with zero
// attempts in the selection is omitted (never enters perSkill → no 0/0 NaN).
describe('deriveStats — difficulty filter (issue #34)', () => {
  // Two skills, mixed difficulties; one skill is Easy-only.
  const sample = [
    attD('a1', 'Inferences', 'Easy',   true,  '2026-06-10T00:00:00Z'),
    attD('a2', 'Inferences', 'Medium', false, '2026-06-10T00:00:00Z'),
    attD('a3', 'Inferences', 'Hard',   false, '2026-06-10T00:00:00Z'),
    attD('a4', 'Inferences', 'Hard',   true,  '2026-06-10T00:00:00Z'),
    attD('b1', 'Linear equations', 'Medium', true, '2026-06-10T00:00:00Z'),
    attD('b2', 'Linear equations', 'Hard',   true, '2026-06-10T00:00:00Z'),
    attD('c1', 'Boundaries', 'Easy', true, '2026-06-10T00:00:00Z'), // Easy-only skill
  ];

  it('counts only attempts in the selected difficulties for each skill', () => {
    const stats = deriveStats(sample, { difficulties: new Set(['Medium', 'Hard']) });

    const inf = stats.perSkill.find((s) => s.skill === 'Inferences')!;
    expect(inf.total).toBe(3);      // a2 (M), a3 (H), a4 (H) — a1 (Easy) excluded
    expect(inf.correct).toBe(1);    // only a4 correct
    expect(inf.accuracy).toBeCloseTo(1 / 3);

    const lin = stats.perSkill.find((s) => s.skill === 'Linear equations')!;
    expect(lin.total).toBe(2);      // b1 (M), b2 (H)
    expect(lin.correct).toBe(2);
    expect(lin.accuracy).toBeCloseTo(1);
  });

  it('omits a skill with zero attempts in the selected difficulties — no NaN accuracy anywhere', () => {
    const stats = deriveStats(sample, { difficulties: new Set(['Medium', 'Hard']) });
    // Boundaries is Easy-only → absent under a Medium+Hard filter.
    expect(stats.perSkill.some((s) => s.skill === 'Boundaries')).toBe(false);
    expect(stats.perSkill.every((s) => Number.isFinite(s.accuracy))).toBe(true);
  });

  it('keeps perSkill sorted worst-accuracy first under a filter', () => {
    const stats = deriveStats(sample, { difficulties: new Set(['Medium', 'Hard']) });
    // Inferences 1/3 ≈ 33% < Linear equations 2/2 = 100%.
    expect(stats.perSkill[0]!.skill).toBe('Inferences');
    expect(stats.perSkill[stats.perSkill.length - 1]!.skill).toBe('Linear equations');
  });

  it('computes the top-line total/correct/accuracy over the filtered pool', () => {
    const stats = deriveStats(sample, { difficulties: new Set(['Medium', 'Hard']) });
    // Filtered latest-per-question pool: a2,a3,a4,b1,b2 = 5 questions, 3 correct (a4,b1,b2).
    expect(stats.total).toBe(5);
    expect(stats.correct).toBe(3);
    expect(stats.accuracy).toBeCloseTo(3 / 5);
  });

  it('treats undefined / empty Set / a Set of all present difficulties as unfiltered (deep-equal perSkill)', () => {
    const base = deriveStats(sample).perSkill;
    expect(deriveStats(sample, {}).perSkill).toEqual(base);
    expect(deriveStats(sample, { difficulties: new Set() }).perSkill).toEqual(base);
    expect(deriveStats(sample, { difficulties: new Set(['Easy', 'Medium', 'Hard']) }).perSkill).toEqual(base);
  });

  it('applies the filter BEFORE latest-per-question: a question whose latest attempt is an unselected difficulty drops out', () => {
    // Same question, two attempts: latest is Easy (unselected), older is Hard (selected).
    const attempts = [
      attD('q9', 'Geometry', 'Hard', false, '2026-06-10T00:00:00Z'), // older, selected
      attD('q9', 'Geometry', 'Easy', true,  '2026-06-12T00:00:00Z'), // latest, unselected
    ];
    const stats = deriveStats(attempts, { difficulties: new Set(['Hard']) });
    const geo = stats.perSkill.find((s) => s.skill === 'Geometry')!;
    // The latest is Easy and excluded; the surviving (latest WITHIN Hard) attempt is the wrong Hard one.
    expect(geo.total).toBe(1);
    expect(geo.correct).toBe(0);
    expect(geo.accuracy).toBe(0);
    // q9's latest result within the filter is "missed".
    expect(stats.seen.q9).toBe('missed');
  });

  it('still excludes tombstoned attempts when a filter is applied', () => {
    const attempts = [
      { ...attD('t1', 'Words', 'Hard', true, '2026-06-10T00:00:00Z'), deleted: true },
      attD('t2', 'Words', 'Hard', false, '2026-06-10T00:00:00Z'),
    ];
    const stats = deriveStats(attempts, { difficulties: new Set(['Hard']) });
    const words = stats.perSkill.find((s) => s.skill === 'Words')!;
    expect(words.total).toBe(1);   // only the non-deleted t2
    expect(words.correct).toBe(0);
  });
});
