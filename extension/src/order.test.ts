import { describe, it, expect } from 'vitest';
import { shuffleIds, newSeed } from './order';

describe('shuffleIds', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

  it('is deterministic: same (ids, seed) yields the same order', () => {
    expect(shuffleIds(ids, 12345)).toEqual(shuffleIds(ids, 12345));
  });

  it('different seeds (usually) yield different orders', () => {
    expect(shuffleIds(ids, 1)).not.toEqual(shuffleIds(ids, 2));
  });

  it('is a permutation: same multiset, no loss, no duplication', () => {
    const out = shuffleIds(ids, 999);
    expect(out).toHaveLength(ids.length);
    expect([...out].sort()).toEqual([...ids].sort());
  });

  it('does not mutate the input array', () => {
    const input = [...ids];
    shuffleIds(input, 7);
    expect(input).toEqual(ids);
  });

  it('handles empty and single-element arrays', () => {
    expect(shuffleIds([], 5)).toEqual([]);
    expect(shuffleIds(['only'], 5)).toEqual(['only']);
  });
});

describe('newSeed', () => {
  it('returns a non-negative 32-bit integer', () => {
    const s = newSeed();
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(0xffffffff);
  });
});
