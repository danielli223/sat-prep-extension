import { describe, it, expect } from 'vitest';
import {
  QUESTION_ATTEMPTED, PRACTICE_RESUMED, CALCULATOR_OPENED,
  buildQuestionAttempted, buildNoteAdded, buildPracticeStarted, buildSessionEnded,
  buildPracticeResumed, buildCalculatorOpened,
} from './events';
import { assertTelemetrySafe } from './scrubber';

describe('event builders', () => {
  it('question_attempted carries only allowlisted, scrubber-safe props', () => {
    const e = buildQuestionAttempted({
      sessionId: 's', questionId: 'ac472881', choicesLength: 4,
      result: { graded: true, correct: false }, revealUsed: true,
      section: 'Math', domain: 'Algebra', skill: 'Linear', difficulty: 'H',
    });
    expect(e.event).toBe(QUESTION_ATTEMPTED);
    expect(e.props.question_type).toBe('mc');
    expect(e.props.result).toBe('incorrect');
    expect(e.props.reveal_used).toBe(true);
    expect(() => assertTelemetrySafe({ event: e.event, ...e.props })).not.toThrow();
  });

  it('maps grid-in and ungraded results', () => {
    expect(buildQuestionAttempted({ sessionId: 's', questionId: 'q', choicesLength: 0,
      result: { graded: false, correct: false }, revealUsed: false,
      section: 'Math', domain: 'Algebra', skill: 'x', difficulty: 'M' }).props.question_type).toBe('grid');
    expect(buildQuestionAttempted({ sessionId: 's', questionId: 'q', choicesLength: 0,
      result: { graded: false, correct: false }, revealUsed: false,
      section: 'Math', domain: 'Algebra', skill: 'x', difficulty: 'M' }).props.result).toBe('unscored');
  });

  it('note_added is null for an empty note and never carries the text', () => {
    expect(buildNoteAdded({ sessionId: 's', questionId: 'q', noteLength: 0 })).toBeNull();
    const e = buildNoteAdded({ sessionId: 's', questionId: 'q', noteLength: 42 })!;
    expect(e.props.note_length).toBe(42);
    expect(JSON.stringify(e)).not.toMatch(/text/);
  });

  it('practice_started buckets the result count', () => {
    expect(buildPracticeStarted({ sessionId: 's', orderMode: 'random', resultCount: 30,
      filterContext: 'SAT|Math|Algebra|Hard' }).props.result_count_bucket).toBe('21-50');
  });

  it('session_ended buckets attempts/accuracy/duration', () => {
    const e = buildSessionEnded({ sessionId: 's', attempted: 10, accuracyPct: 80, durationMs: 600_000 });
    expect(e.props.attempted_bucket).toBe('6-20');
    expect(e.props.accuracy_bucket).toBe('70-84');
    expect(e.props.duration_bucket).toBe('5-15m');
  });

  it('practice_resumed carries the resume index + order length (scrubber-safe)', () => {
    const e = buildPracticeResumed({ sessionId: 's', resumeIndex: 3, totalInOrder: 10 });
    expect(e.event).toBe(PRACTICE_RESUMED);
    expect(e.props.resume_index).toBe(3);
    expect(e.props.total_in_order).toBe(10);
    expect(() => assertTelemetrySafe({ event: e.event, ...e.props })).not.toThrow();
  });

  it('calculator_opened carries the calculator type (scrubber-safe)', () => {
    const e = buildCalculatorOpened({ sessionId: 's', calculatorType: 'desmos' });
    expect(e.event).toBe(CALCULATOR_OPENED);
    expect(e.props.calculator_type).toBe('desmos');
    expect(() => assertTelemetrySafe({ event: e.event, ...e.props })).not.toThrow();
  });
});
