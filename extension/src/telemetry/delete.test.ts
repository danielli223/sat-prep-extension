import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { deleteMyData } from './delete';
import { optIn, getInstallId } from './consent';
import { enqueue, readQueue } from './queue';
import { TELEMETRY_DELETE_URL } from '../config';

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

describe('deleteMyData', () => {
  it('POSTs the current install_id to the deletion endpoint, then clears local state', async () => {
    stubChrome();
    const id = await optIn();
    await enqueue({ event: 'e', timestamp: 't', properties: { distinct_id: id } });
    const f = vi.fn(async () => new Response('{}', { status: 200 }));
    await deleteMyData(f as unknown as typeof fetch);
    const call0 = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(call0[0]).toBe(TELEMETRY_DELETE_URL);
    expect(JSON.parse(call0[1].body as string)).toEqual({ install_id: id });
    expect(await getInstallId()).toBeNull();
    expect(await readQueue()).toEqual([]);
  });

  it('no id → no network, no throw', async () => {
    stubChrome();
    const f = vi.fn();
    await expect(deleteMyData(f as unknown as typeof fetch)).resolves.toBeUndefined();
    expect(f).not.toHaveBeenCalled();
  });
});
