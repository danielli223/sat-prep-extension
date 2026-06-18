import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { enqueue, readQueue, purgeQueue, flush, QUEUE_KEY } from './queue';
import type { QueuedEvent } from './transport';

function stubChrome() {
  const mem: Record<string, unknown> = {};
  vi.stubGlobal('chrome', { storage: { local: {
    get: async (k: string) => (k in mem ? { [k]: mem[k] } : {}),
    set: async (o: Record<string, unknown>) => { Object.assign(mem, o); },
    remove: async (k: string) => { delete mem[k]; },
  } } });
  return mem;
}
const ev = (id: string): QueuedEvent => ({ event: 'e', timestamp: '2026-06-17T00:00:00.000Z',
  properties: { distinct_id: id, $process_person_profile: false, $ip: null } });
beforeEach(() => vi.unstubAllGlobals());
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('queue', () => {
  it('persists across a simulated SW restart (state lives in storage, not memory)', async () => {
    const mem = stubChrome();
    await enqueue(ev('a'));
    expect((mem[QUEUE_KEY] as QueuedEvent[]).length).toBe(1); // survives because it's in storage
    expect((await readQueue()).length).toBe(1);
  });

  it('flush clears the queue on a successful send', async () => {
    stubChrome();
    await enqueue(ev('a'));
    await flush(vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch);
    expect(await readQueue()).toEqual([]);
  });

  it('flush keeps the queue on a retryable failure, drops it on 4xx', async () => {
    stubChrome();
    await enqueue(ev('a'));
    await flush(vi.fn(async () => new Response('', { status: 503 })) as unknown as typeof fetch);
    expect((await readQueue()).length).toBe(1); // retryable: kept
    await flush(vi.fn(async () => new Response('', { status: 400 })) as unknown as typeof fetch);
    expect(await readQueue()).toEqual([]);       // 4xx: dropped
  });

  it('does nothing on an empty queue (no network)', async () => {
    stubChrome();
    const f = vi.fn();
    await flush(f as unknown as typeof fetch);
    expect(f).not.toHaveBeenCalled();
  });
});
