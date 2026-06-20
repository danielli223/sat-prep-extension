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
  properties: { distinct_id: id, $process_person_profile: true, $ip: null } });
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

  it('does NOT lose an event enqueued DURING an in-flight POST (drops only the sent slice)', async () => {
    stubChrome();
    await enqueue(ev('a'));   // the only item in flight when flush starts
    // The send enqueues a SECOND event mid-flight (an emit landed while the POST was outstanding), then
    // succeeds. flush must remove ONLY the item it sent ('a'), not purge the whole key — so 'b' survives.
    const f = vi.fn(async () => { await enqueue(ev('b')); return new Response('{}', { status: 200 }); });
    await flush(f as unknown as typeof fetch);
    const remaining = await readQueue();
    expect(remaining.map((e) => e.properties.distinct_id)).toEqual(['b']);   // 'a' dropped, 'b' kept
  });

  it('on a 4xx drop, removes only the sent slice (a mid-flight enqueue still survives)', async () => {
    stubChrome();
    await enqueue(ev('a'));
    const f = vi.fn(async () => { await enqueue(ev('b')); return new Response('', { status: 400 }); });
    await flush(f as unknown as typeof fetch);
    const remaining = await readQueue();
    expect(remaining.map((e) => e.properties.distinct_id)).toEqual(['b']);   // 4xx drops 'a' only, keeps 'b'
  });

  it('freezes the capture timestamp across a retry (5xx kept, then 200) — never restamped', async () => {
    stubChrome();
    const T = '2026-06-17T00:00:00.000Z';
    await enqueue({ event: 'e', timestamp: T, properties: { distinct_id: 'a', $process_person_profile: true, $ip: null } });

    const seen: string[] = [];
    const record = (init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      seen.push(body.batch[0].timestamp);
    };
    // First flush: 5xx → kept (retryable), so the event stays for the next attempt.
    await flush(vi.fn(async (_u: string, init: RequestInit) => { record(init); return new Response('', { status: 503 }); }) as unknown as typeof fetch);
    expect((await readQueue()).length).toBe(1);
    // Second flush: 200 → sent.
    await flush(vi.fn(async (_u: string, init: RequestInit) => { record(init); return new Response('{}', { status: 200 }); }) as unknown as typeof fetch);

    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(T);
    expect(seen[1]).toBe(T);           // byte-identical across both attempts — stamped at capture, never on retry
    expect(seen[0]).toBe(seen[1]);
  });
});
