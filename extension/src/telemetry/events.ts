import { assertTelemetrySafe } from './scrubber';
import { countBucket, accuracyBucket, durationBucket } from './buckets';
import type { ScoreResult } from '../scoring';

export const QUESTION_ATTEMPTED = 'question_attempted';
export const PRACTICE_STARTED = 'practice_started';
export const PRACTICE_RESUMED = 'practice_resumed';
export const NOTE_ADDED = 'note_added';
export const CALCULATOR_OPENED = 'calculator_opened';
export const JOURNAL_OPENED = 'journal_opened';
export const BADGE_CLICKED = 'badge_clicked';
export const SESSION_ENDED = 'session_ended';
export const DOM_CONTRACT_FAILED = 'dom_contract_failed';
export const UNSCORED_FALLBACK = 'unscored_fallback';
export const BLOCK_DETECTED = 'block_detected';
export const KILLSWITCH_ACTIVATED = 'killswitch_activated';
export const JS_ERROR = 'js_error';
export const TELEMETRY_DISABLED = 'telemetry_disabled';

export interface TelemetryEvent { event: string; props: Record<string, unknown>; }

function make(event: string, props: Record<string, unknown>): TelemetryEvent {
  assertTelemetrySafe({ event, ...props }); // fail-fast in dev/tests; background re-scrubs authoritatively
  return { event, props };
}

export function buildQuestionAttempted(i: {
  sessionId: string; questionId: string; choicesLength: number; result: ScoreResult; revealUsed: boolean;
  section: string; domain: string; skill: string; difficulty: string;
}): TelemetryEvent {
  const result = !i.result.graded ? 'unscored' : i.result.correct ? 'correct' : 'incorrect';
  return make(QUESTION_ATTEMPTED, {
    session_id: i.sessionId, question_id: i.questionId,
    question_type: i.choicesLength > 0 ? 'mc' : 'grid', result, reveal_used: i.revealUsed,
    section: i.section, domain: i.domain, skill: i.skill, difficulty: i.difficulty,
  });
}

export function buildPracticeStarted(i: {
  sessionId: string; orderMode: 'list' | 'random'; resultCount: number; filterContext: string;
}): TelemetryEvent {
  return make(PRACTICE_STARTED, {
    session_id: i.sessionId, order_mode: i.orderMode,
    result_count_bucket: countBucket(i.resultCount), filter_context: i.filterContext,
  });
}

export function buildNoteAdded(i: { sessionId: string; questionId: string; noteLength: number }): TelemetryEvent | null {
  if (i.noteLength <= 0) return null;
  return make(NOTE_ADDED, { session_id: i.sessionId, question_id: i.questionId, note_length: i.noteLength });
}

export function buildSessionEnded(i: {
  sessionId: string; attempted: number; accuracyPct: number; durationMs: number;
}): TelemetryEvent {
  return make(SESSION_ENDED, {
    session_id: i.sessionId, attempted_bucket: countBucket(i.attempted),
    accuracy_bucket: accuracyBucket(i.accuracyPct), duration_bucket: durationBucket(i.durationMs),
  });
}

export function buildPracticeResumed(i: {
  sessionId: string; resumeIndex: number; totalInOrder: number;
}): TelemetryEvent {
  return make(PRACTICE_RESUMED, {
    session_id: i.sessionId, resume_index: i.resumeIndex, total_in_order: i.totalInOrder,
  });
}

export function buildCalculatorOpened(i: {
  sessionId: string; calculatorType: 'geogebra' | 'desmos';
}): TelemetryEvent {
  return make(CALCULATOR_OPENED, { session_id: i.sessionId, calculator_type: i.calculatorType });
}
