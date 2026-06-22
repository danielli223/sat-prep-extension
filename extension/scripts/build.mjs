import { build } from 'esbuild';
import { mkdir, copyFile, readdir } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
// Load extension/.env (KEY=VALUE lines) into process.env without a dependency.
const envPath = new URL('../.env', import.meta.url);
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const TARGETS = {
  chrome:  { out: 'dist',         manifest: 'manifest.json' },
  firefox: { out: 'dist-firefox', manifest: 'manifest.firefox.json' },
  edge:    { out: 'dist-edge',    manifest: 'manifest.edge.json' },
};

const target = process.argv[2] ?? 'chrome';
const cfg = TARGETS[target];
if (!cfg) { console.error(`Unknown target: ${target}. Use chrome|firefox|edge.`); process.exit(1); }

await mkdir(cfg.out, { recursive: true });
await build({
  entryPoints: {
    background: 'src/entrypoints/background.ts',
    content: 'src/entrypoints/content.ts',
    popup: 'src/entrypoints/popup.ts',
  },
  outdir: cfg.out,
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  legalComments: 'none',
  define: { __POSTHOG_PROJECT_TOKEN__: JSON.stringify(process.env.POSTHOG_PROJECT_TOKEN ?? '') },
});
await copyFile(cfg.manifest, `${cfg.out}/manifest.json`);
await copyFile('popup.html', `${cfg.out}/popup.html`);
await mkdir(`${cfg.out}/icons`, { recursive: true });
for (const file of await readdir('icons')) {
  if (file.endsWith('.png')) await copyFile(`icons/${file}`, `${cfg.out}/icons/${file}`);
}
console.log(`Built ${target} extension to ${cfg.out}/`);
