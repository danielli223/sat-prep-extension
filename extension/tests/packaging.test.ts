import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ext = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (f: string) => JSON.parse(readFileSync(join(ext, f), 'utf8'));
const CB = '*://satsuiteeducatorquestionbank.collegeboard.org/*';
const CONFIG = 'https://config.focusedpractice.app/*';

describe('packaging — three browser manifests', () => {
  const manifests = ['manifest.json', 'manifest.firefox.json', 'manifest.edge.json'].map(load);

  it('all three share the identical CB content host', () => {
    for (const m of manifests) {
      expect(m.host_permissions).toContain(CB);
      expect(m.content_scripts[0].matches).toContain(CB);
    }
  });

  it('all three declare OUR config host and NOTHING else outside CB', () => {
    for (const m of manifests) {
      expect(m.host_permissions).toContain(CONFIG);
      for (const h of m.host_permissions) {
        const ok = h === CB || h === CONFIG;
        expect(ok, `unexpected host permission: ${h}`).toBe(true);
      }
      // no host permission may target collegeboard.org beyond the educator bank match
      for (const h of m.host_permissions) {
        if (/collegeboard\.org/i.test(h)) expect(h).toBe(CB);
      }
    }
  });

  it('Firefox uses background.scripts + a gecko id; Chrome/Edge use a service worker', () => {
    const [chrome, firefox, edge] = manifests;
    expect(chrome.background.service_worker).toBe('background.js');
    expect(edge.background.service_worker).toBe('background.js');
    expect(firefox.background.scripts).toEqual(['background.js']);
    expect(firefox.browser_specific_settings.gecko.id).toMatch(/@/);
  });
});
