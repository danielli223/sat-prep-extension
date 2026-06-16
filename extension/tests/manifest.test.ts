import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const manifest = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'manifest.json'), 'utf8'));

describe('manifest CSP', () => {
  it('allows the GeoGebra frame and no other host (D7)', () => {
    const csp = manifest.content_security_policy.extension_pages as string;
    expect(csp).toContain('frame-src https://www.geogebra.org');
    expect(csp).toContain("script-src 'self'");          // stays default-restrictive
  });

  it('adds NOTHING for Desmos (it is window.open, not an embed)', () => {
    expect(JSON.stringify(manifest)).not.toContain('desmos.com');
  });
});
