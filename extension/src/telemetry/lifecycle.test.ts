import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { optOut } from './lifecycle';
import { optIn, getInstallId, isOptedIn } from './consent';

function stubChrome() {
  const mem: Record<string, unknown> = {};
  vi.stubGlobal('chrome', { storage: { local: {
    get: async (k: string) => (k in mem ? { [k]: mem[k] } : {}),
    set: async (o: Record<string, unknown>) => { Object.assign(mem, o); },
    remove: async (k: string | string[]) => { for (const x of [k].flat()) delete mem[x as string]; },
  } } });
  return mem;
}
beforeEach(() => vi.unstubAllGlobals());
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('optOut', () => {
  it('sends a final telemetry_disabled with the original id, then deletes id + consent', async () => {
    stubChrome();
    const id = await optIn();
    const bodies: any[] = [];
    const f = vi.fn(async (_u: string, init: RequestInit) => { bodies.push(JSON.parse(init.body as string)); return new Response('{}', { status: 200 }); });
    await optOut(f as unknown as typeof fetch);
    const sent = bodies.flatMap((b) => b.batch);
    expect(sent.some((e: any) => e.event === 'telemetry_disabled' && e.properties.distinct_id === id)).toBe(true);
    expect(await getInstallId()).toBeNull();
    expect(await isOptedIn()).toBe(false);
  });
});
