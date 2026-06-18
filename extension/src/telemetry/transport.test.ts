import { describe, it, expect, vi } from 'vitest';
import { buildBatch, sendBatch, type QueuedEvent } from './transport';
import { POSTHOG_INGEST_URL, POSTHOG_PROJECT_TOKEN } from '../config';

const ev: QueuedEvent = {
  event: 'question_attempted', timestamp: '2026-06-17T12:00:00.000Z',
  properties: { distinct_id: 'u1', $process_person_profile: false, $ip: null, question_id: 'q', result: 'correct' },
};

describe('transport', () => {
  it('builds the PostHog batch body: api_key top-level, distinct_id inside properties', () => {
    const body = buildBatch([ev]) as any;
    expect(body.api_key).toBe(POSTHOG_PROJECT_TOKEN);
    expect(body.historical_migration).toBe(false);
    expect(body.batch[0].event).toBe('question_attempted');
    expect(body.batch[0].timestamp).toBe('2026-06-17T12:00:00.000Z');
    expect(body.batch[0].properties.distinct_id).toBe('u1');
    expect(body.batch[0].properties.$process_person_profile).toBe(false);
    expect(body.batch[0].properties.$ip).toBe(null);
  });

  it('every event in the batch carries $ip:null (hygiene, checked at the wire)', () => {
    const body = buildBatch([ev, { ...ev }]) as any;
    for (const e of body.batch) expect(e.properties.$ip).toBe(null);
  });

  it('POSTs to the PostHog US batch URL and reports ok on 200', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ status: 1 }), { status: 200 }));
    const r = await sendBatch([ev], f as unknown as typeof fetch);
    expect(f.mock.calls[0]![0]).toBe(POSTHOG_INGEST_URL);
    expect(r).toEqual({ ok: true, retryable: false });
  });

  it('marks 5xx/network as retryable and 4xx as non-retryable', async () => {
    const five = vi.fn(async () => new Response('', { status: 503 }));
    expect(await sendBatch([ev], five as unknown as typeof fetch)).toEqual({ ok: false, retryable: true });
    const four = vi.fn(async () => new Response('', { status: 400 }));
    expect(await sendBatch([ev], four as unknown as typeof fetch)).toEqual({ ok: false, retryable: false });
    const down = vi.fn(async () => { throw new TypeError('offline'); });
    expect(await sendBatch([ev], down as unknown as typeof fetch)).toEqual({ ok: false, retryable: true });
  });
});
