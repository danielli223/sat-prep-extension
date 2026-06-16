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
// Any network transport pointed at collegeboard.org. Broadened beyond fetch/XHR/axios to the other
// exfil channels an enumeration backdoor could hide behind: sendBeacon, EventSource, WebSocket, and
// assigning a CB URL to a .src (e.g. `new Image().src = qbankUrl`). Single-line, order-tolerant.
const FETCH_TO_CB =
  /(?:fetch|XMLHttpRequest|axios|sendBeacon|EventSource|WebSocket|\.src\s*=)[^\n;]*collegeboard\.org/i;

// Spec §10 guardrail: never persist a comprehensive `questionID → {skill|domain|difficulty}` index.
// Taxonomy is stored ONLY as per-attempt context (the Attempt row). Flag any object/record literal
// that maps a question id to a metadata shape outside that path.
const QID_METADATA_INDEX =
  /(?:Record|Map)<\s*(?:questionId|string)\s*,\s*\{[^}]*\b(?:skill|domain|difficulty)\b[^}]*\}/i;

describe('legal CI guard', () => {
  const files = tsFiles(SRC);
  it('scans at least the core source files', () => { expect(files.length).toBeGreaterThan(5); });

  for (const file of files) {
    it(`${file.replace(SRC, 'src')}: no qbank-api / no CB network call / no questionId→metadata index`, () => {
      const code = readFileSync(file, 'utf8');
      expect(code, 'must not reference qbank-api').not.toMatch(FORBIDDEN_TOKEN);
      expect(code, 'must not issue network calls to collegeboard.org').not.toMatch(FETCH_TO_CB);
      expect(code, 'must not build a questionId→metadata index (spec §10)').not.toMatch(QID_METADATA_INDEX);
    });
  }
});
