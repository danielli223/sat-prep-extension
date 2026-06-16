import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';

await mkdir('dist', { recursive: true });
await build({
  entryPoints: {
    background: 'src/entrypoints/background.ts',
    content: 'src/entrypoints/content.ts',
    popup: 'src/entrypoints/popup.ts',
  },
  outdir: 'dist',
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  legalComments: 'none',
});
await copyFile('manifest.json', 'dist/manifest.json');
await copyFile('popup.html', 'dist/popup.html');
console.log('Built extension to dist/');
