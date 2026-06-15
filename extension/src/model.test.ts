import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeAttempt, makeNote, makeSession, SCHEMA_VERSION } from './model';

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-15T00:00:00.000Z')); });
afterEach(() => { vi.useRealTimers(); });

describe('record factories', () => {
  it('makeAttempt populates the sync envelope + fields', () => {
    const a = makeAttempt({
      deviceId: 'dev-1', questionId: 'ac472881', section: 'Math', domain: 'Algebra',
      skill: 'Linear equations in one variable', difficulty: 'Hard', pick: 'B', correct: true,
    });
    expect(a.attemptId).toMatch(/[0-9a-f-]{36}/);
    expect(a.userId).toBeNull();
    expect(a.deviceId).toBe('dev-1');
    expect(a.questionId).toBe('ac472881');
    expect(a.correct).toBe(true);
    expect(a.deleted).toBe(false);
    expect(a.dirty).toBe(true);
    expect(a.schemaVersion).toBe(SCHEMA_VERSION);
    expect(a.createdAt).toBe('2026-06-15T00:00:00.000Z');
    expect(a.updatedAt).toBe('2026-06-15T00:00:00.000Z');
  });

  it('makeNote and makeSession share the envelope shape', () => {
    const n = makeNote({ deviceId: 'd', questionId: 'q1', text: 'missed the trap' });
    expect(n.noteId).toMatch(/[0-9a-f-]{36}/);
    expect(n.text).toBe('missed the trap');
    const s = makeSession({ deviceId: 'd', filterContext: 'SAT|Math|Algebra|Hard', orderMode: 'random', shuffleSeed: 7 });
    expect(s.filterContext).toBe('SAT|Math|Algebra|Hard');
    expect(s.orderMode).toBe('random');
    expect(s.lastQuestionId).toBeNull();
  });
});
