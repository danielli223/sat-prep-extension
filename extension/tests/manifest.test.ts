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
  it(`${file} grants telemetry egress + alarms`, () => {
    const m = loadManifest(file); // use the helper this test file already defines
    expect(m.permissions).toContain('alarms');
    expect(m.host_permissions).toContain('https://us.i.posthog.com/*');
    expect(m.host_permissions).toContain('https://api.focusedpractice.app/*');
  });
}
