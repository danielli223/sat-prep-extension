import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index';

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
});
