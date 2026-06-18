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
});
