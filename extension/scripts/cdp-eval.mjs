// Evaluate JavaScript in the dev Chrome's CB tab and print the JSON result — the CDP analog of the
// browser-automation javascript_tool, so Claude can inspect/drive the page in the Claude-controlled dev
// Chrome (search flow, reproduce states, read the overlay) without any manual interaction.
//
//   node scripts/cdp-eval.mjs "document.title"
//   node scripts/cdp-eval.mjs --file probe.js
import { readFileSync } from 'node:fs';
import { isUp, listTargets, evalIn, CB_HOST } from './lib/cdp.mjs';

if (!(await isUp())) { console.error('dev Chrome not reachable — run `npm run dev:chrome`'); process.exit(1); }

const args = process.argv.slice(2);
let expr;
if (args[0] === '--file') expr = readFileSync(args[1], 'utf8');
else expr = args.join(' ');
if (!expr) { console.error('usage: cdp-eval.mjs "<js expression>"  |  --file <path>'); process.exit(1); }

const pages = (await listTargets()).filter((t) => t.type === 'page' && (t.url || '').includes(CB_HOST));
if (!pages.length) { console.error(`no CB tab open (looking for ${CB_HOST})`); process.exit(1); }
// Wrap so a bare statement/last-expression value is returned, and Promises are awaited.
const wrapped = `(async () => { return (${expr}); })()`;
try {
  const value = await evalIn(pages[0].webSocketDebuggerUrl, wrapped);
  console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
} catch (e) {
  // Fall back to running it as statements (for multi-line scripts that aren't a single expression).
  try {
    const value = await evalIn(pages[0].webSocketDebuggerUrl, `(async () => { ${expr} })()`);
    console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
  } catch (e2) { console.error('eval error:', e2.message); process.exit(1); }
}
