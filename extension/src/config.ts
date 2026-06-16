// OUR config host — the ONLY network destination the extension ever contacts.
// Static asset (a tiny JSON flag) on our own infrastructure. NEVER collegeboard.org, NEVER qbank-api.
// Hosted as an immutable-ish static file so a C&D / terms change can flip the overlay off instantly
// (spec §8.2) without users updating. Keep this hostname in sync with manifest host_permissions.
export const CONFIG_HOST = 'config.focusedpractice.app';
export const CONFIG_FLAG_URL = `https://${CONFIG_HOST}/v1/flags.json`;
