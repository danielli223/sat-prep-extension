import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    // Keep the suite hermetic / offline-safe: when a test mounts the GeoGebra <iframe>, happy-dom
    // must NOT actually fetch geogebra.org. This suppresses the iframe page load only; iframe.src is
    // still the real URL, so no assertion is weakened.
    environmentOptions: {
      happyDOM: { settings: { disableIframePageLoading: true } },
    },
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
