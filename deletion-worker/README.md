# Deletion Worker

Server side of the extension's "delete my analytics data". `POST /v1/delete` with
`{ "install_id": "<uuid>" }` → calls PostHog `persons/bulk_delete` (delete_events:true)
for that distinct_id. Deletion is asynchronous on PostHog's side.

## One-time setup
1. In PostHog (project "Focused Practice", id 376909): create a **personal API key**
   (Settings → User → Personal API keys) scoped to this project with the `person:write`
   scope (and `person:read` if you later add a status check). Copy the `phx_...` value.
2. Store it as the Worker secret (never committed):
   `npx wrangler secret put POSTHOG_PERSONAL_API_KEY`
3. Deploy: `npx wrangler deploy`
4. Bind the route to `api.focusedpractice.app/v1/*` (Cloudflare dashboard → the Worker →
   Triggers → Routes, or add a `routes` entry to `wrangler.jsonc` once the zone is on
   Cloudflare). This host is already in the extension's `host_permissions`.

## Local dev
- Copy `.dev.vars.example` → `.dev.vars`, fill in a dev `phx_` key, then `npm run dev`.

## Test / typecheck
- `npm test` (vitest-pool-workers; mocks the PostHog call — never hits live PostHog).
- `npm run typecheck`.

## Notes
- `delete_events:true` removes only events captured BEFORE the request; PostHog runs the
  ClickHouse deletion during off-peak/weekend windows, so it is not instantaneous.
- Requires the extension to send `$process_person_profile:true` (person profiles ON) so a
  person exists to delete; otherwise `persons_found` is 0 and nothing is erased.
