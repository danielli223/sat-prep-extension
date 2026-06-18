// OUR config host — the ONLY network destination the extension ever contacts.
// Static asset (a tiny JSON flag) on our own infrastructure. NEVER collegeboard.org, NEVER qbank-api.
// Hosted as an immutable-ish static file so a C&D / terms change can flip the overlay off instantly
// (spec §8.2) without users updating. Keep this hostname in sync with manifest host_permissions.
export const CONFIG_HOST = 'config.focusedpractice.app';
export const CONFIG_FLAG_URL = `https://${CONFIG_HOST}/v1/flags.json`;

// Telemetry egress (spec 2026-06-17). Opt-in only; the scrubber is the legal boundary.
// PostHog US Cloud batch ingestion. The project token is PUBLIC/write-only by PostHog's design and
// ships in the bundle; the private key (phx_...) is NEVER bundled. The token is injected at BUILD time
// from extension/.env (gitignored) for dev/prod separation — see scripts/build.mjs. Empty under test.
export const POSTHOG_INGEST_URL = 'https://us.i.posthog.com/batch/';
declare const __POSTHOG_PROJECT_TOKEN__: string | undefined;
export const POSTHOG_PROJECT_TOKEN =
  typeof __POSTHOG_PROJECT_TOKEN__ === 'string' ? __POSTHOG_PROJECT_TOKEN__ : '';
// Our own deletion-only endpoint (a Cloudflare Worker holding the private key, separate repo).
export const TELEMETRY_DELETE_URL = 'https://api.focusedpractice.app/v1/delete';
// Remote telemetry kill flag rides on the existing flags.json (CONFIG_FLAG_URL); cache key:
export const TELEMETRY_FLAG_CACHE_KEY = 'telemetry.remoteAllowed';

// Consent-UI launch gate. Stays FALSE until PRIVACY.md + the Chrome Web Store data-disclosure ship
// (plan Rollout step 6). The popup renders NO telemetry consent surface while this is false, so the
// live opt-in toggle can never become user-reachable ahead of the legal/disclosure deliverables.
export const TELEMETRY_UI_ENABLED = false;
