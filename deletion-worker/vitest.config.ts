import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: {
            POSTHOG_PERSONAL_API_KEY: 'phx_test_key',
            POSTHOG_PROJECT_ID: '376909',
            POSTHOG_API_HOST: 'https://ph.test',
          },
        },
      },
    },
  },
});
