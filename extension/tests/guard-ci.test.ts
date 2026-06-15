import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return tsFiles(p);
    return p.endsWith('.ts') ? [p] : [];
  });
}

const FORBIDDEN_TOKEN = /qbank-api/i;                                   // CB's private backend — never referenced
const FETCH_TO_CB = /(?:fetch|XMLHttpRequest|axios)[^\n;]*collegeboard\.org/i; // never call CB endpoints

describe('legal CI guard', () => {
  const files = tsFiles(SRC);
  it('scans at least the core source files', () => { expect(files.length).toBeGreaterThan(5); });

  for (const file of files) {
    it(`${file.replace(SRC, 'src')}: no qbank-api / no fetch to collegeboard.org`, () => {
      const code = readFileSync(file, 'utf8');
      expect(code, 'must not reference qbank-api').not.toMatch(FORBIDDEN_TOKEN);
      expect(code, 'must not issue network calls to collegeboard.org').not.toMatch(FETCH_TO_CB);
    });
  }
});
