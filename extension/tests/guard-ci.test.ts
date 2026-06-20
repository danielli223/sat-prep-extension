import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const EXT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(EXT_ROOT, 'src');

// Trees the legal guard scans. The guard is the build-failing backstop for "never call CB", so it
// must see EVERY tree that can ship or run executable code — not just src/. tests/ and scripts/ can
// equally hide a fetch to CB (a fixture fetcher, a build step), so they are scanned too. node_modules
// and the dist* build outputs are excluded (third-party / generated, not our source).
const SCAN_ROOTS = [SRC, join(EXT_ROOT, 'tests'), join(EXT_ROOT, 'scripts')];
const EXCLUDE_DIR = /^(?:node_modules|dist.*)$/;

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (EXCLUDE_DIR.test(name)) return [];
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return tsFiles(p);
    return p.endsWith('.ts') || p.endsWith('.mjs') || p.endsWith('.js') ? [p] : [];
  });
}

const FORBIDDEN_TOKEN = /qbank-api/i;                                   // CB's private backend — never referenced

// The guard forbids *referencing* CB's private backend in executable code — not *documenting* that
// we never touch it. A full-line "// NEVER qbank-api" comment and a `not.toMatch(/qbank-api/i)`
// negative assertion are the never-guess contract being written down, not a real call. Drop full-line
// comments (NOT inline ones — those could hide a real URL like https://qbank-api.collegeboard.org/x
// behind a trailing `//`) and drop negative-assertion lines before scanning, so the legal
// documentation can name what it bans without tripping the guard on itself.
function executableCode(src: string): string {
  return src
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line)) // drop full-line comments (documentation prose)
    .filter((line) => !/\bnot\.(?:toMatch|toContain)\b/.test(line)) // drop negative assertions
    .join('\n');
}
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

// Plan 4 hardening: the kill-switch may fetch OUR host ONLY. Any other fetched http(s) literal that
// is NOT our config host is a violation. We also forbid any "retry on CB block" shape (spec §8.3:
// on a block we DISABLE, never retry).
// Allowed egress hosts (spec 2026-06-17): our config host, PostHog US ingestion, our deletion endpoint.
// Every fetched http(s) literal must target one of these; CB is forbidden everywhere.
const ALLOWED_EGRESS_HOSTS = ['config.focusedpractice.app', 'us.i.posthog.com', 'api.focusedpractice.app'];
const FETCH_LITERAL = /fetch\(\s*[`'"]([^`'"]+)[`'"]/g;           // each fetched string literal
const RETRY_ON_CB = /(retry|while\s*\([^)]*\)|for\s*\([^)]*\))[^\n;]*collegeboard\.org/i;

describe('legal CI guard', () => {
  // The guard names the very tokens it bans (FORBIDDEN_TOKEN, the CB-network regexes, the
  // "// NEVER qbank-api" doc-comment). Those are the ban-list definition, not a real call — and a
  // self-scan would trip on them. Exclude only THIS file; every other tree/file is still scanned.
  const SELF = fileURLToPath(import.meta.url);
  const files = SCAN_ROOTS.flatMap(tsFiles).filter((f) => f !== SELF);
  it('scans at least the core source files', () => { expect(files.length).toBeGreaterThan(5); });

  for (const file of files) {
    it(`${file.replace(EXT_ROOT, '.')}: no qbank-api / no CB network call / no questionId→metadata index`, () => {
      const code = executableCode(readFileSync(file, 'utf8'));
      expect(code, 'must not reference qbank-api').not.toMatch(FORBIDDEN_TOKEN);
      expect(code, 'must not issue network calls to collegeboard.org').not.toMatch(FETCH_TO_CB);
      expect(code, 'must not build a questionId→metadata index (spec §10)').not.toMatch(QID_METADATA_INDEX);
      // (a) every fetched literal URL must be OUR config host (or a relative/extension URL)
      for (const m of code.matchAll(FETCH_LITERAL)) {
        const target = m[1]!;
        if (/^https?:\/\//i.test(target)) {
          expect(ALLOWED_EGRESS_HOSTS.some((h) => target.includes(h)), `fetch target ${target} must be an allowed egress host`).toBe(true);
          expect(target, 'must never fetch collegeboard.org').not.toMatch(/collegeboard\.org/i);
        }
      }
      // (b) no retry/loop pointed at a CB block (spec §8.3 — disable, never retry)
      expect(code, 'must not retry against collegeboard.org').not.toMatch(RETRY_ON_CB);
      // Negative lookbehind: exempt the `.startsWith('phx_')` assertion needle in config.test.ts
      // (that line proves the key is NOT present); catch any real key assignment or reference.
      expect(code, 'must never bundle a PostHog PRIVATE key (phx_)').not.toMatch(/(?<!\.startsWith\(')phx_/);
    });
  }

  it('the kill-switch fetches exactly OUR config host (allowlist is non-vacuous)', () => {
    const ks = readFileSync(join(SRC, 'resilience', 'killswitch.ts'), 'utf8');
    expect(ks, 'killswitch must fetch via the config constant').toMatch(/CONFIG_FLAG_URL/);
    expect(ks, 'killswitch must not hardcode a CB URL').not.toMatch(/collegeboard\.org/i);
  });
});
