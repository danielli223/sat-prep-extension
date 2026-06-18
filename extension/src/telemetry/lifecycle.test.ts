import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { optOut } from './lifecycle';
import { optIn, getInstallId, isOptedIn, CONSENT_VERSION } from './consent';
import { POSTHOG_INGEST_URL } from '../config';

function stubChrome() {
  const mem: Record<string, unknown> = {};
  vi.stubGlobal('chrome', { storage: { local: {
    get: async (k: string) => (k in mem ? { [k]: mem[k] } : {}),
    set: async (o: Record<string, unknown>) => { Object.assign(mem, o); },
    remove: async (k: string | string[]) => { for (const x of [k].flat()) delete mem[x as string]; },
  } } });
  return mem;
}
const ctx = { appVersion: '0.0.1', ua: '... Firefox/121', nowMs: Date.parse('2026-06-17T00:00:00Z') };
beforeEach(() => vi.unstubAllGlobals());
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('optOut', () => {
  it('sends a final telemetry_disabled with the original id, then deletes id + consent', async () => {
    stubChrome();
    const id = await optIn();
    const bodies: any[] = [];
    const f = vi.fn(async (_u: string, init: RequestInit) => { bodies.push(JSON.parse(init.body as string)); return new Response('{}', { status: 200 }); });
    await optOut(ctx, f as unknown as typeof fetch);
    const sent = bodies.flatMap((b) => b.batch);
    expect(sent.some((e: any) => e.event === 'telemetry_disabled' && e.properties.distinct_id === id)).toBe(true);
    expect(await getInstallId()).toBeNull();
    expect(await isOptedIn()).toBe(false);
  });

  it('the flushed telemetry_disabled carries the FULL super-property set + posts to PostHog', async () => {
    stubChrome();
    await optIn();
    const bodies: any[] = [];
    const urls: string[] = [];
    const f = vi.fn(async (u: string, init: RequestInit) => {
      urls.push(u); bodies.push(JSON.parse(init.body as string)); return new Response('{}', { status: 200 });
    });
    await optOut(ctx, f as unknown as typeof fetch);
    const disabled = bodies.flatMap((b) => b.batch).find((e: any) => e.event === 'telemetry_disabled');
    expect(disabled).toBeTruthy();
    // Full super-props, not just distinct_id.
    expect(disabled.properties.browser).toBe('firefox');
    expect(disabled.properties.app_version).toBe('0.0.1');
    expect(disabled.properties.consent_version).toBe(CONSENT_VERSION);
    expect(disabled.properties.days_since_install_bucket).toBe('day_0');
    expect(disabled.properties.$process_person_profile).toBe(true);
    expect(disabled.properties.$ip).toBe(null);
    // Egress goes to the PostHog ingest URL.
    expect(urls[0]).toBe(POSTHOG_INGEST_URL);
  });

  it('no install_id → no network, no throw (nothing to disable)', async () => {
    stubChrome(); // never opted in → no install_id
    const f = vi.fn(async () => new Response('{}', { status: 200 }));
    await expect(optOut(ctx, f as unknown as typeof fetch)).resolves.toBeUndefined();
    expect(f).not.toHaveBeenCalled();
  });
});
