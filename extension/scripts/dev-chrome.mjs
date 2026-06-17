// Launch (or reuse) a dedicated dev Chrome that auto-loads the unpacked extension and exposes CDP, so
// Claude can iterate with zero manual clicks. Uses a throwaway --user-data-dir (NOT your real profile)
// because Chrome 136+ ignores --remote-debugging-port on the default profile. The extension is loaded
// via --load-extension=dist, so there's no "Load unpacked" click either.
//
//   npm run build && npm run dev:chrome      # first time / after a cold start
//   npm run reload                            # after each rebuild (see reload-ext.mjs)
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { isUp } from './lib/cdp.mjs';

const PORT = process.env.CDP_PORT || 9222;
const DIST = resolve(process.cwd(), 'dist');
const PROFILE = resolve(process.cwd(), '.dev-chrome-profile');
const URL = process.env.DEV_URL || 'https://satsuiteeducatorquestionbank.collegeboard.org/digital/search';

// Prefer Chrome for Testing — Google's automation build, which still respects --load-extension and
// --remote-debugging-port (regular Chrome stable ignores both as of 2025). Playwright caches CfT under
// ms-playwright/chromium-<rev>/, so reuse it if present; otherwise fall back to regular Chrome.
function findChromeForTesting() {
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  if (!existsSync(cache)) return null;
  const revs = readdirSync(cache).filter((d) => d.startsWith('chromium-') && !d.includes('headless'))
    .sort((a, b) => parseInt(b.split('-')[1]) - parseInt(a.split('-')[1]));   // newest first
  for (const rev of revs) {
    for (const arch of ['chrome-mac-arm64', 'chrome-mac']) {
      const bin = join(cache, rev, arch, 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
      if (existsSync(bin)) return bin;
    }
  }
  return null;
}

const BIN = process.env.CHROME_BIN || findChromeForTesting() || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
].find(existsSync);

if (!BIN) { console.error('No Chrome for Testing / Chrome binary found — set CHROME_BIN=/path/to/chrome'); process.exit(1); }
if (!existsSync(DIST)) { console.error('dist/ missing — run `npm run build` first'); process.exit(1); }

if (await isUp()) { console.log(`dev Chrome already running on :${PORT} (reusing)`); process.exit(0); }

const args = [
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`,            // non-default dir: required for CDP since Chrome 136
  `--load-extension=${DIST}`,              // auto-load our unpacked extension (no manual click)
  `--disable-extensions-except=${DIST}`,
  '--no-first-run', '--no-default-browser-check', '--disable-features=Translate',
  URL,
];
console.log(`launching: ${BIN}\n  ${args.join('\n  ')}`);
const child = spawn(BIN, args, { detached: true, stdio: 'ignore' });
child.unref();

const t0 = Date.now();
while (Date.now() - t0 < 15000) { if (await isUp()) break; await new Promise(r => setTimeout(r, 300)); }
if (!(await isUp())) { console.error(`dev Chrome did not expose CDP on :${PORT}`); process.exit(1); }
console.log(`✓ dev Chrome up on :${PORT}, extension loaded from dist/, opened ${URL}`);
