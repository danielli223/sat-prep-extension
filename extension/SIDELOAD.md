# Install / sideload (Firefox · Edge · Chrome)

We package for Chrome, Firefox, and Edge so an IP complaint on one store can't remove the extension
everywhere (spec §11, O3). Your journal is local-only, so even a delisting never destroys your data.

## Build the per-browser bundles

```bash
cd extension
npm run build            # Chrome (dist/)
npm run build:firefox    # Firefox (dist-firefox/)
npm run build:edge       # Edge (dist-edge/)
```

## Sideload

- **Chrome / Edge:** open `chrome://extensions` (or `edge://extensions`) → enable Developer mode →
  **Load unpacked** → select the matching `dist*/` folder.
- **Firefox:** open `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → select
  `dist-firefox/manifest.json`. (For a permanent install, submit the signed `.xpi` to AMO.)

The College Board host match is identical across all three builds; only the background style
(service worker vs. scripts) and the Firefox `gecko` id differ.
