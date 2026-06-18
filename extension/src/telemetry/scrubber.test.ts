import { describe, it, expect } from 'vitest';
import { assertTelemetrySafe, TelemetryGuardError } from './scrubber';

describe('assertTelemetrySafe (telemetry legal boundary)', () => {
  it('accepts an allowlisted question_attempted payload', () => {
    expect(() => assertTelemetrySafe({
      event: 'question_attempted', install_id: 'u', session_id: 's', app_version: '0.0.1',
      browser: 'chrome', consent_version: '1', days_since_install_bucket: 'day_0',
      $process_person_profile: false, $ip: null,
      question_id: 'ac472881', question_type: 'mc', result: 'incorrect', reveal_used: true,
      section: 'Math', domain: 'Algebra', skill: 'Linear equations', difficulty: 'H',
    })).not.toThrow();
  });

  it('rejects any key carrying CB content or free text', () => {
    for (const key of ['question_stem', 'passage', 'choices', 'rationale', 'note_text', 'error_stack', 'page_url']) {
      expect(() => assertTelemetrySafe({ event: 'x', [key]: 'anything' })).toThrow(TelemetryGuardError);
    }
  });

  it('rejects an over-long allowlisted string (possible smuggled content)', () => {
    expect(() => assertTelemetrySafe({ event: 'x', skill: 'a'.repeat(65) })).toThrow(TelemetryGuardError);
  });

  it('rejects a nested object (only scalars may leave the device)', () => {
    expect(() => assertTelemetrySafe({ event: 'x', props: { nested: 1 } })).toThrow(TelemetryGuardError);
  });

  it('enforces the PostHog hygiene flags exactly', () => {
    expect(() => assertTelemetrySafe({ event: 'x', $ip: '1.2.3.4' })).toThrow(TelemetryGuardError);
    expect(() => assertTelemetrySafe({ event: 'x', $process_person_profile: true })).toThrow(TelemetryGuardError);
  });
});
