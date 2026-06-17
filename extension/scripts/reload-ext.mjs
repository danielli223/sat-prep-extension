// Reload the unpacked extension in the dev Chrome AND refresh the CB tab(s) so the new content script
// injects — the two steps that previously required a manual click in chrome://extensions + ⌘R.
//
// Mechanism: chrome.developerPrivate.reload() (exactly what the chrome://extensions reload button calls)
// driven over CDP in a transient chrome://extensions tab, then Page.reload the CB tab(s). This path
// works on Chrome for Testing where --load-extension is respected but Extensions.loadUnpacked and the
// dormant MV3 service-worker target are not reachable.
//
//   npm run build && npm run reload     (or: npm run reload:build)
import { isUp, listTargets, withTarget, evalInNewTab, CB_HOST } from './lib/cdp.mjs';

if (!(await isUp())) {
  console.error('dev Chrome not reachable on CDP — run `npm run dev:chrome` first');
  process.exit(1);
}

// Reload every UNPACKED extension (only ours is loaded in the dev profile). Resolves with their names.
const names = await evalInNewTab('chrome://extensions', `
  new Promise((resolve, reject) => {
    if (!chrome.developerPrivate) return reject(new Error('developerPrivate unavailable'));
    chrome.developerPrivate.getExtensionsInfo({}, (list) => {
      const unpacked = (list || []).filter((e) => e.type === 'EXTENSION' && e.location === 'UNPACKED');
      if (!unpacked.length) return resolve([]);
      let done = 0; const out = [];
      unpacked.forEach((e) => {
        out.push(e.name);
        chrome.developerPrivate.reload(e.id, { failQuietly: true }, () => { if (++done === unpacked.length) resolve(out); });
      });
    });
  })
`);
if (!names.length) { console.error('no unpacked extension found to reload'); process.exit(1); }
console.log(`✓ reloaded: ${names.join(', ')}`);

await new Promise((r) => setTimeout(r, 800)); // let the fresh worker register its content scripts

const pages = (await listTargets()).filter((t) => t.type === 'page' && (t.url || '').includes(CB_HOST));
for (const p of pages) {
  await withTarget(p.webSocketDebuggerUrl, async (send) => {
    await send('Page.enable').catch(() => {});
    await send('Page.reload', { ignoreCache: true });
  });
  console.log(`  ↻ ${p.url}`);
}
console.log(pages.length ? `✓ refreshed ${pages.length} CB tab(s)` : '(no CB tab open to refresh)');
