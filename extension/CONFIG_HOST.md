# Config host

The extension contacts exactly ONE network endpoint: `https://config.focusedpractice.app/v1/flags.json`
(see `src/config.ts`). It is a tiny static JSON file on OUR infrastructure. It is NEVER a
collegeboard.org URL and NEVER the qbank-api.

## Flag shape

```json
{ "enabled": true }
```

- `enabled: true`  → overlay runs normally.
- `enabled: false` → overlay disables itself on next page load / next poll (the remote kill-switch,
  spec §8.2). Used for a C&D, a terms change, or a CB DOM break we can't hot-fix in time.

## Failure policy (default-ON)

If the fetch fails (offline, host down, CORS, non-200, malformed JSON, timeout), `isEnabled()`
returns the **last cached value**, or `true` if there is no cache. Default-ON means a flaky host
never bricks a paying-nothing student's local journal; the kill-switch is for *active* takedown,
which is an explicit `false`, not an absence.

## CORS

`flags.json` must be served with `Access-Control-Allow-Origin: *` (or the extension origin) so the
content-script `fetch` succeeds. It carries no credentials (`credentials: 'omit'`).
