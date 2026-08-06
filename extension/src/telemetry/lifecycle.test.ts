import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { optOut, reportDecline, ANONYMOUS_DECLINE_ID } from './lifecycle';
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

describe('reportDecline — the anonymous decline counter', () => {
  const send = () => {
    const bodies: any[] = [];
    const urls: string[] = [];
    const f = vi.fn(async (u: string, init: RequestInit) => {
      urls.push(u); bodies.push(JSON.parse(init.body as string)); return new Response('{}', { status: 200 });
    });
    return { bodies, urls, f: f as unknown as typeof fetch, calls: () => f.mock.calls.length };
  };

  it('counts a decline with NO identifier of any kind and no person profile', async () => {
    stubChrome();
    const { bodies, urls, f } = send();
    await reportDecline(ctx, f);

    const sent = bodies.flatMap((b) => b.batch);
    expect(sent).toHaveLength(1);
    const e = sent[0];
    expect(e.event).toBe('telemetry_declined');
    expect(urls[0]).toBe(POSTHOG_INGEST_URL);

    // The whole point: nothing that could identify or re-identify anyone.
    expect(e.properties.distinct_id).toBe(ANONYMOUS_DECLINE_ID);
    expect(e.properties.$process_person_profile).toBe(false);
    expect(e.properties.$ip).toBeNull();
    expect(e.properties.install_id).toBeUndefined();
    expect(e.properties.session_id).toBeUndefined();
    expect(e.properties.question_id).toBeUndefined();
    // An install timestamp + version is a weak fingerprint; it must not ride along.
    expect(e.properties.days_since_install_bucket).toBeUndefined();
    // Only these five keys, ever.
    expect(Object.keys(e.properties).sort()).toEqual(
      ['$ip', '$process_person_profile', 'app_version', 'browser', 'consent_version', 'distinct_id'].sort(),
    );
  });

  it('never mints an install id for someone who declined', async () => {
    stubChrome();
    const { f } = send();
    await reportDecline(ctx, f);
    expect(await getInstallId()).toBeNull();
    expect(await isOptedIn()).toBe(false);
  });

  it('fires AT MOST ONCE per install, so it can never become a usage signal', async () => {
    stubChrome();
    const a = send();
    await reportDecline(ctx, a.f);
    expect(a.calls()).toBe(1);

    const b = send();
    await reportDecline(ctx, b.f);   // dismissed again later
    await reportDecline(ctx, b.f);   // and again
    expect(b.calls()).toBe(0);
  });

  it('does NOT fire for someone who opted in (that path emits telemetry_disabled instead)', async () => {
    stubChrome();
    await optIn();
    const { f, calls } = send();
    await reportDecline(ctx, f);
    expect(calls()).toBe(0);
  });

  it('marks the install as counted even if the network POST fails, so a retry cannot double-count', async () => {
    stubChrome();
    const dead = vi.fn(async () => { throw new Error('offline'); });
    await reportDecline(ctx, dead as unknown as typeof fetch);

    const { calls, f } = send();
    await reportDecline(ctx, f);
    expect(calls()).toBe(0);
  });

  it('never throws, even with storage entirely unavailable', async () => {
    vi.stubGlobal('chrome', undefined);
    const { f } = send();
    await expect(reportDecline(ctx, f)).resolves.toBeUndefined();
  });
});
