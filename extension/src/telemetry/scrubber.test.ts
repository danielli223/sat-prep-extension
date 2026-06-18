import { describe, it, expect } from 'vitest';
import { assertTelemetrySafe, TelemetryGuardError } from './scrubber';

describe('assertTelemetrySafe (telemetry legal boundary)', () => {
  it('accepts an allowlisted question_attempted payload', () => {
    expect(() => assertTelemetrySafe({
      event: 'question_attempted', install_id: 'u', session_id: 's', app_version: '0.0.1',
      browser: 'chrome', consent_version: '1', days_since_install_bucket: 'day_0',
      $process_person_profile: true, $ip: null,
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
    expect(() => assertTelemetrySafe({ event: 'x', $process_person_profile: false })).toThrow(TelemetryGuardError);
  });

  it('rejects IP-shaped string values on any allowlisted key (defense-in-depth, spec Resilience)', () => {
    expect(() => assertTelemetrySafe({ event: 'x', skill: '1.2.3.4' })).toThrow(TelemetryGuardError);
  });

  it('rejects URL-shaped string values (no CB URL / no link can leave the device)', () => {
    expect(() => assertTelemetrySafe({ event: 'x', filter_context: 'http://x' })).toThrow(TelemetryGuardError);
    expect(() => assertTelemetrySafe({ event: 'x', filter_context: 'collegeboard.org://thing' })).toThrow(TelemetryGuardError);
  });

  it('enforces numeric bounds on count/index fields', () => {
    expect(() => assertTelemetrySafe({ event: 'x', note_length: 999999999 })).toThrow(TelemetryGuardError);
    expect(() => assertTelemetrySafe({ event: 'x', note_length: -1 })).toThrow(TelemetryGuardError);
    expect(() => assertTelemetrySafe({ event: 'x', resume_index: -1 })).toThrow(TelemetryGuardError);
    expect(() => assertTelemetrySafe({ event: 'x', total_in_order: -1 })).toThrow(TelemetryGuardError);
  });

  it('accepts valid in-range numbers and benign strings', () => {
    expect(() => assertTelemetrySafe({
      event: 'practice_resumed', install_id: 'b3f1c2d4-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
      app_version: '0.0.1', filter_context: 'SAT|Math|Algebra|Hard',
      note_length: 0, resume_index: 0, total_in_order: 0,
    })).not.toThrow();
    expect(() => assertTelemetrySafe({ event: 'x', note_length: 10000, resume_index: 5, total_in_order: 50 })).not.toThrow();
  });
});
