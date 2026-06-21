import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ext = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (f: string) => JSON.parse(readFileSync(join(ext, f), 'utf8'));
const CB = '*://satsuiteeducatorquestionbank.collegeboard.org/*';
const CONFIG = 'https://config.focusedpractice.app/*';
const POSTHOG = 'https://us.i.posthog.com/*';
const DELETE_EP = 'https://api.focusedpractice.app/*';

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
        const ok = h === CB || h === CONFIG || h === POSTHOG || h === DELETE_EP;
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

  // The three variants must be EQUIVALENT packages, not just CB-host-equal. Issue #17 removed the
  // GeoGebra in-page embed, so NONE of the three may carry a frame-src host anymore — the one
  // calculator is the real Desmos opened in a separate window (never an iframe). The CSP must still
  // be present, default-restrictive, identical across variants, and free of any embedded host.
  it('all three carry the same embed-free CSP — no GeoGebra frame-src, no embedded host', () => {
    for (const m of manifests) {
      const csp = m.content_security_policy?.extension_pages as string | undefined;
      expect(csp, 'missing extension_pages CSP').toBeTruthy();
      expect(csp).toContain("script-src 'self'");                  // stays default-restrictive
      expect(csp).not.toContain('frame-src https://www.geogebra.org');
      expect(csp).not.toContain('geogebra.org');
      expect(csp).not.toContain('desmos.com');                     // bright line: Desmos is never embedded
    }
    const csps = manifests.map((m) => m.content_security_policy.extension_pages);
    expect(new Set(csps).size, 'CSP extension_pages diverges across variants').toBe(1);
  });

  it('all three expose the journal popup via action.default_popup', () => {
    for (const m of manifests) {
      expect(m.action?.default_popup, 'missing action.default_popup').toBe('popup.html');
    }
  });
});
