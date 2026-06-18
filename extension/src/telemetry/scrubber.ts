// TELEMETRY LEGAL BOUNDARY (spec Appendix A). Mirror of guard.ts's assertNoQuestionContent, but for
// data leaving the device to a third party. ONLY allowlisted, bounded, scalar fields may pass; a bug
// can never silently exfiltrate CB content, a student's note, a URL, a stack trace, or PII.
const ALLOWED: Record<string, number> = {
  // super-properties
  event: 64, install_id: 64, session_id: 64, app_version: 16, browser: 32, consent_version: 16,
  days_since_install_bucket: 32,
  // question_attempted
  question_id: 64, question_type: 8, result: 16, section: 64, domain: 64, skill: 64, difficulty: 8,
  // practice_started / resumed
  order_mode: 8, filter_context: 96, result_count_bucket: 16, resume_index: 0, total_in_order: 0,
  // note / calculator
  note_length: 0, calculator_type: 16,
  // session_ended
  attempted_bucket: 16, accuracy_bucket: 16, duration_bucket: 16,
  // health
  failure_reason: 32, block_reason: 32, error_code: 32, component: 32,
};
const BOOL_KEYS = new Set(['reveal_used']);

export class TelemetryGuardError extends Error {
  constructor(message: string) { super(message); this.name = 'TelemetryGuardError'; }
}

export function assertTelemetrySafe(payload: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(payload)) {
    // PostHog hygiene flags: fixed values, nothing else.
    if (key === '$process_person_profile') {
      if (value !== false) throw new TelemetryGuardError('$process_person_profile must be false');
      continue;
    }
    if (key === '$ip') {
      if (value !== null) throw new TelemetryGuardError('$ip must be null (no IP capture)');
      continue;
    }
    if (BOOL_KEYS.has(key)) {
      if (typeof value !== 'boolean') throw new TelemetryGuardError(`Field "${key}" must be boolean`);
      continue;
    }
    if (!(key in ALLOWED)) {
      throw new TelemetryGuardError(`Disallowed telemetry field "${key}"`);
    }
    if (value === null || value === undefined) continue;
    if (typeof value === 'object') {
      throw new TelemetryGuardError(`Field "${key}" must be a scalar, not an object`);
    }
    if (typeof value === 'string') {
      const limit = ALLOWED[key]!;
      if (limit > 0 && value.length > limit) {
        throw new TelemetryGuardError(`Field "${key}" exceeds ${limit} chars — possible content leak`);
      }
    }
  }
}
