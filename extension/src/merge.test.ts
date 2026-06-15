import { describe, it, expect } from 'vitest';
import { mergeRecord, mergeCollections } from './merge';
import type { Envelope } from './types';

type Row = Envelope & { id: string };
const row = (id: string, updatedAt: string, deleted = false): Row =>
  ({ id, updatedAt, deleted, userId: null, deviceId: 'd', createdAt: '2026-06-01T00:00:00Z', dirty: false, schemaVersion: 1 });

describe('merge (last-write-wins + tombstones)', () => {
  it('mergeRecord keeps the newer updatedAt', () => {
    expect(mergeRecord(row('a', '2026-06-10T00:00:00Z'), row('a', '2026-06-12T00:00:00Z'))!.updatedAt)
      .toBe('2026-06-12T00:00:00Z');
  });
  it('mergeRecord returns the present side when the other is undefined', () => {
    expect(mergeRecord(undefined, row('a', 't'))!.id).toBe('a');
    expect(mergeRecord(row('a', 't'), undefined)!.id).toBe('a');
  });
  it('mergeCollections unions by key and drops tombstoned winners', () => {
    const local = [row('a', '2026-06-10T00:00:00Z'), row('b', '2026-06-10T00:00:00Z')];
    const remote = [row('a', '2026-06-12T00:00:00Z', true), row('c', '2026-06-09T00:00:00Z')];
    const out = mergeCollections(local, remote, (r) => r.id).map((r) => r.id).sort();
    expect(out).toEqual(['b', 'c']); // 'a' won as a tombstone → removed
  });
});
