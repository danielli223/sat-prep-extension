import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    // Keep the suite hermetic / offline-safe.
    // - disableIframePageLoading: when a test mounts the GeoGebra <iframe>, happy-dom must NOT fetch
    //   geogebra.org. iframe.src is still the real URL, so no assertion is weakened.
    // - disableJavaScript*: tests inject CB-shaped HTML fixtures into the LIVE document; happy-dom would
    //   otherwise EVALUATE any <script> they carry. A CB script is an ES module, so it surfaces as an
    //   unhandled "Unexpected token 'export'" rejection that fails the run (exit 1). We assert DOM
    //   structure, never execute page scripts, so disabling script eval/loading is pure hardening.
    environmentOptions: {
      happyDOM: {
        settings: {
          disableIframePageLoading: true,
          disableJavaScriptEvaluation: true,
          disableJavaScriptFileLoading: true,
        },
      },
    },
    // Fake ONLY Date when a test calls vi.useFakeTimers(). fake-indexeddb schedules its async work
    // via setImmediate/setTimeout (lib/scheduling.js); faking those (the vitest default) deadlocks
    // store-backed tests that pin system time (e.g. journal.test.ts) — the DB callbacks never fire.
    // Tests that need deterministic timestamps (model/journal) only ever fake Date.
    fakeTimers: { toFake: ['Date'] },
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts', '*.test.ts'],
  },
});
