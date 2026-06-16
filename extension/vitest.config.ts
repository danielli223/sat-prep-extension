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
    // Fake ONLY Date when a test calls vi.useFakeTimers(). fake-indexeddb schedules its async work
    // via setImmediate/setTimeout (lib/scheduling.js); faking those (the vitest default) deadlocks
    // store-backed tests that pin system time (e.g. journal.test.ts) — the DB callbacks never fire.
    // Tests that need deterministic timestamps (model/journal) only ever fake Date.
    fakeTimers: { toFake: ['Date'] },
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
