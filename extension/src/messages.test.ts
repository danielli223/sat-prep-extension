import { describe, it, expect } from 'vitest';
import { OPEN_JOURNAL, TELEMETRY_EVENT, TELEMETRY_DELETE, TELEMETRY_OPTOUT } from './messages';

describe('message-type constants are distinct', () => {
  it('exposes telemetry message types', () => {
    expect(TELEMETRY_EVENT).toBe('telemetry-event');
    expect(TELEMETRY_DELETE).toBe('telemetry-delete');
    expect(TELEMETRY_OPTOUT).toBe('telemetry-optout');
  });
  it('no two message types collide', () => {
    const all = [OPEN_JOURNAL, TELEMETRY_EVENT, TELEMETRY_DELETE, TELEMETRY_OPTOUT];
    expect(new Set(all).size).toBe(all.length);
  });
});
