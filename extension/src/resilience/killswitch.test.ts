import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isEnabled, CACHE_KEY } from './killswitch';
import { CONFIG_FLAG_URL } from '../config';

// In-memory chrome.storage.local stub.
function stubChrome() {
  const mem: Record<string, unknown> = {};
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: async (k: string) => (k in mem ? { [k]: mem[k] } : {}),
        set: async (o: Record<string, unknown>) => { Object.assign(mem, o); },
      },
    },
  });
  return mem;
}

beforeEach(() => { vi.unstubAllGlobals(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('isEnabled (kill-switch)', () => {
  it('returns true and caches it when the flag says enabled', async () => {
    const mem = stubChrome();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ enabled: true }), { status: 200 })));
    expect(await isEnabled()).toBe(true);
    expect(mem[CACHE_KEY]).toBe(true);
  });

  it('returns false when the flag explicitly disables (the takedown switch)', async () => {
    const mem = stubChrome();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ enabled: false }), { status: 200 })));
    expect(await isEnabled()).toBe(false);
    expect(mem[CACHE_KEY]).toBe(false);
  });

  it('fetches OUR config URL with no credentials — never a CB URL', async () => {
    stubChrome();
    const f = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ enabled: true }), { status: 200 }));
    vi.stubGlobal('fetch', f);
    await isEnabled();
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe(CONFIG_FLAG_URL);
    expect(String(url)).not.toMatch(/collegeboard\.org/i);
    expect((init as RequestInit).credentials).toBe('omit');
  });

  it('default-ON: network failure with no cache yields true (never throws)', async () => {
    stubChrome();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network down'); }));
    await expect(isEnabled()).resolves.toBe(true);
  });

  it('falls back to the cached value on failure (cached false stays false)', async () => {
    const mem = stubChrome();
    mem[CACHE_KEY] = false;
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    expect(await isEnabled()).toBe(false);
  });

  it('treats a non-200 or malformed body as a failure (falls back, never throws)', async () => {
    const mem = stubChrome();
    mem[CACHE_KEY] = true;
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 500 })));
    await expect(isEnabled()).resolves.toBe(true);
  });
});
