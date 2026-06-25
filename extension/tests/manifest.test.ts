import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadManifest(file: string): Record<string, unknown> & {
  permissions: string[];
  host_permissions: string[];
  content_security_policy: Record<string, string>;
} {
  return JSON.parse(readFileSync(join(ROOT, file), 'utf8'));
}

const manifest = loadManifest('manifest.json');

describe('manifest CSP', () => {
  it('iframes no embedded host — nothing is framed (issue #17 removed the GeoGebra embed)', () => {
    // The in-page GeoGebra calculator is gone; the one calculator is the real Desmos opened in a
    // separate window (never an iframe). So the CSP carries NO frame-src host at all, while staying
    // default-restrictive. desmos.com must NOT appear here either (asserted below).
    const csp = manifest.content_security_policy.extension_pages as string;
    expect(csp).not.toContain('frame-src https://www.geogebra.org');
    expect(csp).not.toContain('geogebra.org');
    expect(csp).toContain("script-src 'self'");          // stays default-restrictive
  });

  it('adds NOTHING for Desmos (it is window.open, not an embed)', () => {
    expect(JSON.stringify(manifest)).not.toContain('desmos.com');
  });
});

for (const file of ['manifest.json', 'manifest.firefox.json', 'manifest.edge.json']) {
  // v0.0.1 ships with telemetry gated OFF (TELEMETRY_UI_ENABLED=false). The analytics plumbing
  // is unreachable, so its permissions must NOT be declared yet: a Chrome Web Store reviewer
  // rejects host permissions / APIs the shipped code never exercises. The alarms permission and
  // the PostHog/delete hosts get RE-ADDED in the same release that flips telemetry live
  // (Rollout step 6), alongside the published privacy policy + data disclosure.
  it(`${file} does NOT declare unused telemetry egress/alarms until telemetry ships`, () => {
    const m = loadManifest(file);
    expect(m.permissions).not.toContain('alarms');
    expect(m.host_permissions).not.toContain('https://us.i.posthog.com/*');
    expect(m.host_permissions).not.toContain('https://api.focusedpractice.app/*');
  });

  // The kill-switch config host is a resilience invariant (#6) and IS exercised on every load,
  // so it stays. The two College Board content hosts are the extension's core function.
  it(`${file} keeps the kill-switch config host + CB content hosts and storage`, () => {
    const m = loadManifest(file);
    expect(m.permissions).toContain('storage');
    expect(m.host_permissions).toContain('https://config.focusedpractice.app/*');
    expect(m.host_permissions).toContain('*://satsuiteeducatorquestionbank.collegeboard.org/*');
    expect(m.host_permissions).toContain('*://mypractice.collegeboard.org/*');
  });
}
