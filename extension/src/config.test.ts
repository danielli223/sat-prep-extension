import { describe, it, expect } from 'vitest';
import { CONFIG_FLAG_URL, CONFIG_HOST } from './config';

describe('config host', () => {
  it('points at OUR host over https — never collegeboard.org', () => {
    const u = new URL(CONFIG_FLAG_URL);
    expect(u.protocol).toBe('https:');
    expect(u.hostname).toBe(CONFIG_HOST);
    expect(u.hostname).not.toMatch(/collegeboard\.org$/i);
    expect(CONFIG_FLAG_URL).not.toMatch(/qbank-api/i);
  });

  it('CONFIG_HOST is a bare hostname usable in manifest host_permissions', () => {
    expect(CONFIG_HOST).toMatch(/^[a-z0-9.-]+\.[a-z]{2,}$/i);
    expect(CONFIG_HOST).not.toContain('/');
  });
});

import { POSTHOG_INGEST_URL, POSTHOG_PROJECT_TOKEN, TELEMETRY_DELETE_URL } from './config';

describe('telemetry egress constants', () => {
  it('posts events to the PostHog US batch host, never CB', () => {
    expect(POSTHOG_INGEST_URL).toBe('https://us.i.posthog.com/batch/');
    expect(POSTHOG_INGEST_URL).not.toMatch(/collegeboard\.org/i);
  });
  it('never falls back to a private key; injected at build, empty under test', () => {
    // No esbuild `define` under vitest → empty string, NOT a private key.
    expect(POSTHOG_PROJECT_TOKEN.startsWith('phx_')).toBe(false);
    expect(typeof POSTHOG_PROJECT_TOKEN).toBe('string');
  });
  it('targets our own deletion endpoint host', () => {
    expect(TELEMETRY_DELETE_URL).toBe('https://api.focusedpractice.app/v1/delete');
  });
});
