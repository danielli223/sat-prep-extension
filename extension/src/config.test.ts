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
