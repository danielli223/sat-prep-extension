import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { detectBrowser, ingestTelemetryEvent } from './ingest';
import { readQueue } from './queue';
import { optIn } from './consent';

function stubChrome() {
  const mem: Record<string, unknown> = {};
  vi.stubGlobal('chrome', { storage: { local: {
    get: async (k: string) => (k in mem ? { [k]: mem[k] } : {}),
    set: async (o: Record<string, unknown>) => { Object.assign(mem, o); },
    remove: async (k: string) => { delete mem[k]; },
  } } });
  return mem;
}
const ctx = { appVersion: '0.0.1', ua: 'Mozilla Chrome/120', nowMs: Date.parse('2026-06-17T00:00:00Z') };
beforeEach(() => vi.unstubAllGlobals());
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('background ingest', () => {
  it('detects the browser from the UA', () => {
    expect(detectBrowser('... Edg/120')).toBe('edge');
    expect(detectBrowser('... Firefox/121')).toBe('firefox');
    expect(detectBrowser('... Chrome/120')).toBe('chrome');
  });

  it('drops events entirely when not opted in (no queueing, no network)', async () => {
    stubChrome();
    await ingestTelemetryEvent({ event: 'question_attempted', props: { question_id: 'q' } }, ctx);
    expect(await readQueue()).toEqual([]);
  });

  it('when opted in, injects super-props ($ip:null, install_id, browser, days bucket) and enqueues', async () => {
    stubChrome();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ telemetryAllowed: true }), { status: 200 })));
    const id = await optIn();
    await ingestTelemetryEvent({ event: 'question_attempted', props: { question_id: 'q', result: 'correct' } }, ctx);
    const q = await readQueue();
    expect(q.length).toBe(1);
    expect(q[0]!.properties.distinct_id).toBe(id);
    expect(q[0]!.properties.$ip).toBe(null);
    expect(q[0]!.properties.$process_person_profile).toBe(false);
    expect(q[0]!.properties.browser).toBe('chrome');
    expect(q[0]!.properties.days_since_install_bucket).toBe('day_0');
    expect(typeof q[0]!.timestamp).toBe('string');
  });

  it('re-scrubs authoritatively: a disallowed key from a tampered message is rejected, not queued', async () => {
    stubChrome();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ telemetryAllowed: true }), { status: 200 })));
    await optIn();
    await ingestTelemetryEvent({ event: 'question_attempted', props: { note_text: 'leak!' } }, ctx);
    expect(await readQueue()).toEqual([]); // scrubber threw → swallowed → nothing queued
  });
});
