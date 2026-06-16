import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';

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
});
await copyFile(cfg.manifest, `${cfg.out}/manifest.json`);
await copyFile('popup.html', `${cfg.out}/popup.html`);
console.log(`Built ${target} extension to ${cfg.out}/`);
