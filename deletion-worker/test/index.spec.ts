import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index';
import { vi, afterEach } from 'vitest';
afterEach(() => vi.restoreAllMocks());

const VALID_ID = '4156b4fe-3f36-4c9d-859f-ca179b497cbc';

function req(url: string, init?: RequestInit): Request { return new Request(url, init); }

describe('deletion worker', () => {
  it('returns 404 for an unknown path', async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(req('https://api.focusedpractice.app/'), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(404);
  });

  const DELETE_URL = 'https://api.focusedpractice.app/v1/delete';
  const EXT_ORIGIN = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';

  it('answers the CORS preflight with 204 and allow-methods', async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(req(DELETE_URL, { method: 'OPTIONS', headers: { Origin: EXT_ORIGIN } }), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(EXT_ORIGIN);
  });

  it('rejects GET on the delete path with 405', async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(req(DELETE_URL, { method: 'GET' }), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(405);
  });

  it('returns 404 for POST to a wrong path', async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(req('https://api.focusedpractice.app/other', { method: 'POST' }), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(404);
  });

  function postJson(body: unknown, ct = 'application/json'): Request {
    return req(DELETE_URL, { method: 'POST', headers: { 'Content-Type': ct, Origin: EXT_ORIGIN }, body: JSON.stringify(body) });
  }

  it('rejects a non-JSON content-type with 415', async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(req(DELETE_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'x' }), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(415);
  });

  it('rejects a missing/invalid install_id with 400', async () => {
    for (const body of [{}, { install_id: 123 }, { install_id: 'too-short' }, { install_id: 'a'.repeat(64) }]) {
      const ctx = createExecutionContext();
      const res = await worker.fetch(postJson(body), env, ctx);
      await waitOnExecutionContext(ctx);
      expect(res.status).toBe(400);
    }
  });

  it('forwards a valid install_id to PostHog bulk_delete with the Bearer key, returns 202', async () => {
    const phMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ persons_found: 1, events_queued_for_deletion: true }), { status: 202 }),
    );
    const ctx = createExecutionContext();
    const res = await worker.fetch(postJson({ install_id: VALID_ID }), env, ctx);
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ ok: true, submitted: true, matched: true });
    const [url, init] = phMock.mock.calls[0]!;
    expect(String(url)).toBe('https://ph.test/api/projects/376909/persons/bulk_delete/');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer phx_test_key' });
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ distinct_ids: [VALID_ID], delete_events: true });
  });

  it('reports matched:false when PostHog found no person (still ok/submitted)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ persons_found: 0, events_queued_for_deletion: false }), { status: 202 }),
    );
    const ctx = createExecutionContext();
    const res = await worker.fetch(postJson({ install_id: VALID_ID }), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ ok: true, matched: false });
  });

  it('returns 502 when PostHog errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 403 }));
    const ctx = createExecutionContext();
    const res = await worker.fetch(postJson({ install_id: VALID_ID }), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(502);
  });

  it('returns 429 and never calls PostHog when rate-limited', async () => {
    const phMock = vi.spyOn(globalThis, 'fetch');
    const limited: Env = { ...env, RATE_LIMITER: { limit: async () => ({ success: false }) } as unknown as RateLimit };
    const ctx = createExecutionContext();
    const res = await worker.fetch(postJson({ install_id: VALID_ID }), limited, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(429);
    expect(phMock).not.toHaveBeenCalled();
  });
});
