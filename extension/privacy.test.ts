import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const privacy = readFileSync(join(root, 'PRIVACY.md'), 'utf8');

describe('privacy policy', () => {
  it('makes the only-IDs-and-own-data claim', () => {
    expect(privacy).toMatch(/only.*question ID/i);
    expect(privacy).toMatch(/your own data|your answers and progress/i);
    expect(privacy).toMatch(/never store.*question (content|text)/i);
  });

  it('contains the Chrome Web Store Limited Use statement', () => {
    expect(privacy).toMatch(/limited use/i);
    expect(privacy).toMatch(/do not sell|not sold|never sold/i);
    expect(privacy).toMatch(/no (server|backend|account)|local-only|stays on your device/i);
  });

  it('contains the non-affiliation notice verbatim', () => {
    expect(privacy).toMatch(/Not affiliated with, authorized, or endorsed by College Board; SAT is a trademark of the College Board/);
  });

  it('states no AI ever touches CB content', () => {
    expect(privacy).toMatch(/never.*AI/i);
  });
});
