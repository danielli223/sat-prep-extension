import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { firstRunOnboarding, ONBOARDING_KEY, TRUST_LINE } from './onboarding';

function stubChrome() {
  const mem: Record<string, unknown> = {};
  vi.stubGlobal('chrome', {
    storage: { local: {
      get: async (k: string) => (k in mem ? { [k]: mem[k] } : {}),
      set: async (o: Record<string, unknown>) => { Object.assign(mem, o); },
    } },
  });
  return mem;
}

beforeEach(() => { vi.unstubAllGlobals(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('first-run onboarding', () => {
  it('returns the trust line and sets the seen flag on first run', async () => {
    const mem = stubChrome();
    expect(await firstRunOnboarding()).toBe(TRUST_LINE);
    expect(mem[ONBOARDING_KEY]).toBe(true);
  });

  it('returns null on subsequent runs (shown exactly once)', async () => {
    const mem = stubChrome();
    mem[ONBOARDING_KEY] = true;
    expect(await firstRunOnboarding()).toBeNull();
  });

  it('the trust line states live, unaltered, never-AI, never-stored', () => {
    expect(TRUST_LINE).toMatch(/served live from collegeboard\.org/i);
    expect(TRUST_LINE).toMatch(/never rewrite/i);
    expect(TRUST_LINE).toMatch(/never run them through AI/i);
    expect(TRUST_LINE).toMatch(/never store them/i);
  });
});
