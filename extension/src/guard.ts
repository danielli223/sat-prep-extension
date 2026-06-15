// LEGAL INVARIANT GUARD.
// Only IDs + the student's own data may be persisted. Any non-allowlisted field, or a
// suspiciously long string, throws — so a bug can never silently store CB question content.
const ALLOWED_KEYS = new Set<string>([
  // envelope
  'userId', 'deviceId', 'createdAt', 'updatedAt', 'deleted', 'dirty', 'schemaVersion',
  // attempt
  'attemptId', 'questionId', 'section', 'domain', 'skill', 'difficulty', 'pick', 'correct',
  // note
  'noteId', 'text',
  // session
  'sessionId', 'filterContext', 'orderMode', 'shuffleSeed', 'lastQuestionId',
]);

const MAX_LEN: Record<string, number> = {
  text: 2000,          // the student's own free-text note — bounded
  pick: 200,           // grid-in values are short; long => suspicious
  questionId: 64,
  skill: 200, domain: 200, section: 64, difficulty: 32, filterContext: 256,
};

export class QuestionContentError extends Error {
  constructor(message: string) { super(message); this.name = 'QuestionContentError'; }
}

export function assertNoQuestionContent(record: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(record)) {
    if (!ALLOWED_KEYS.has(key)) {
      throw new QuestionContentError(`Disallowed field "${key}": only IDs + the student's own data may be stored`);
    }
    if (typeof value === 'string') {
      const limit = MAX_LEN[key];
      if (limit !== undefined && value.length > limit) {
        throw new QuestionContentError(`Field "${key}" exceeds ${limit} chars — possible question content`);
      }
    }
  }
}
