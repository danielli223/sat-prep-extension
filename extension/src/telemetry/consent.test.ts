import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isOptedIn, optIn, clearLocalTelemetry, isTelemetryEnabled, getInstallId, INSTALL_ID_KEY,
} from './consent';

function stubChrome() {
  const mem: Record<string, unknown> = {};
  vi.stubGlobal('chrome', { storage: { local: {
    get: async (k: string) => (k in mem ? { [k]: mem[k] } : {}),
    set: async (o: Record<string, unknown>) => { Object.assign(mem, o); },
    remove: async (k: string) => { delete mem[k]; },
  } } });
  return mem;
}
beforeEach(() => vi.unstubAllGlobals());
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('consent + install_id', () => {
  it('is off and id-less before opt-in', async () => {
    stubChrome();
    expect(await isOptedIn()).toBe(false);
    expect(await getInstallId()).toBeNull();
  });

  it('opt-in mints a uuid and flips consent on', async () => {
    const mem = stubChrome();
    const id = await optIn();
    expect(id).toMatch(/[0-9a-f-]{36}/i);
    expect(mem[INSTALL_ID_KEY]).toBe(id);
    expect(await isOptedIn()).toBe(true);
  });

  it('clearLocalTelemetry deletes the id and turns consent off', async () => {
    const mem = stubChrome();
    await optIn();
    await clearLocalTelemetry();
    expect(mem[INSTALL_ID_KEY]).toBeUndefined();
    expect(await isOptedIn()).toBe(false);
  });

  it('isTelemetryEnabled is the AND of opt-in and the remote flag', async () => {
    stubChrome();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ telemetryAllowed: true }), { status: 200 })));
    expect(await isTelemetryEnabled()).toBe(false); // not opted in yet
    await optIn();
    expect(await isTelemetryEnabled()).toBe(true);  // opted in + remote allows
  });

  it('remote force-disable wins even when opted in', async () => {
    stubChrome();
    await optIn();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ telemetryAllowed: false }), { status: 200 })));
    expect(await isTelemetryEnabled()).toBe(false);
  });

  it('remote flag defaults ON when unreachable (a blip never silences a consented user)', async () => {
    stubChrome();
    await optIn();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    expect(await isTelemetryEnabled()).toBe(true);
  });

  it('makes NO network call before opt-in (locks the AND short-circuit against an order regression)', async () => {
    stubChrome(); // never opted in
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ telemetryAllowed: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
    expect(await isTelemetryEnabled()).toBe(false);
    // The opt-in check must short-circuit BEFORE remoteAllowed() fetches the flag. If the AND were
    // reordered (remote first), this fetch would fire — telemetry network before consent.
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
