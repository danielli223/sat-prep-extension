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
  // Telemetry is LIVE (TELEMETRY_UI_ENABLED=true, Rollout step 6), so the permissions the analytics
  // path actually exercises must be declared — otherwise chrome.alarms is undefined and
  // background.ts never installs the telemetry listener at all (the egress silently no-ops).
  // These three go together: flip the config flag and these permissions in the SAME release as the
  // published privacy policy + Chrome Web Store data disclosure. Each needs a dashboard
  // justification: alarms = the 1-minute batch flush; PostHog = product-improvement analytics;
  // api.focusedpractice.app = the user-initiated "delete my analytics data" endpoint.
  it(`${file} declares the telemetry egress hosts + alarms now that telemetry ships`, () => {
    const m = loadManifest(file);
    expect(m.permissions).toContain('alarms');
    expect(m.host_permissions).toContain('https://us.i.posthog.com/*');
    expect(m.host_permissions).toContain('https://api.focusedpractice.app/*');
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
