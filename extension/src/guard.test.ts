import { describe, it, expect } from 'vitest';
import { assertNoQuestionContent, QuestionContentError } from './guard';

describe('assertNoQuestionContent', () => {
  it('accepts an allowlisted attempt record', () => {
    expect(() => assertNoQuestionContent({
      attemptId: 'a', userId: null, deviceId: 'd', questionId: 'ac472881',
      section: 'Math', domain: 'Algebra', skill: 'Linear equations', difficulty: 'Hard',
      pick: 'B', correct: true, createdAt: 't', updatedAt: 't', deleted: false, dirty: true, schemaVersion: 1,
    })).not.toThrow();
  });

  it('rejects a record carrying question text under a non-allowlisted key', () => {
    expect(() => assertNoQuestionContent({ questionId: 'x', questionText: 'If 3x+7=22...' }))
      .toThrow(QuestionContentError);
  });

  it('rejects choices/passage/explanation fields outright', () => {
    for (const key of ['choices', 'passage', 'explanation', 'correctAnswer', 'stem', 'rationale']) {
      expect(() => assertNoQuestionContent({ questionId: 'x', [key]: 'anything' })).toThrow(QuestionContentError);
    }
  });

  it('rejects an over-long note (likely pasted question content)', () => {
    expect(() => assertNoQuestionContent({ noteId: 'n', questionId: 'q', text: 'a'.repeat(2001) }))
      .toThrow(QuestionContentError);
  });

  it('rejects an over-long pick', () => {
    expect(() => assertNoQuestionContent({ questionId: 'q', pick: 'a'.repeat(201) })).toThrow(QuestionContentError);
  });
});
