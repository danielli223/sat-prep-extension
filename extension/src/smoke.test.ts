import { describe, it, expect } from 'vitest';

describe('toolchain smoke', () => {
  it('runs vitest with happy-dom (document exists)', () => {
    expect(typeof document).toBe('object');
    expect(typeof crypto.randomUUID).toBe('function');
  });
});
