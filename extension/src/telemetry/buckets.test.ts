import { describe, it, expect } from 'vitest';
import { countBucket, accuracyBucket, durationBucket, daysSinceInstallBucket } from './buckets';

describe('bucketing (deterministic, timezone-agnostic)', () => {
  it('countBucket boundaries', () => {
    expect(countBucket(1)).toBe('1-5'); expect(countBucket(5)).toBe('1-5');
    expect(countBucket(6)).toBe('6-20'); expect(countBucket(20)).toBe('6-20');
    expect(countBucket(21)).toBe('21-50'); expect(countBucket(50)).toBe('21-50');
    expect(countBucket(51)).toBe('51+');
  });
  it('accuracyBucket boundaries (percent)', () => {
    expect(accuracyBucket(0)).toBe('0-49'); expect(accuracyBucket(49)).toBe('0-49');
    expect(accuracyBucket(50)).toBe('50-69'); expect(accuracyBucket(70)).toBe('70-84');
    expect(accuracyBucket(85)).toBe('85-100'); expect(accuracyBucket(100)).toBe('85-100');
  });
  it('durationBucket boundaries (ms)', () => {
    expect(durationBucket(60_000)).toBe('0-1m'); expect(durationBucket(60_001)).toBe('1-5m');
    expect(durationBucket(900_000)).toBe('5-15m');
    expect(durationBucket(1_800_000)).toBe('15-60m'); expect(durationBucket(3_600_000)).toBe('15-60m');
    expect(durationBucket(3_600_001)).toBe('60m+');
  });
  it('daysSinceInstallBucket is deterministic regardless of clock value', () => {
    const t0 = '2026-01-01T00:00:00.000Z';
    const day = 86_400_000;
    const at = (d: number) => Date.parse(t0) + d * day + 1000;
    expect(daysSinceInstallBucket(t0, at(0))).toBe('day_0');
    expect(daysSinceInstallBucket(t0, at(1))).toBe('day_1-7');
    expect(daysSinceInstallBucket(t0, at(7))).toBe('day_1-7');
    expect(daysSinceInstallBucket(t0, at(8))).toBe('day_8-30');
    expect(daysSinceInstallBucket(t0, at(31))).toBe('day_31-90');
    expect(daysSinceInstallBucket(t0, at(91))).toBe('day_90+');
  });
});
