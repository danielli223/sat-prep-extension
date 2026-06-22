# Running multiple dev-Chrome builds side by side

> *Last updated: 2026-06-21*

When several worktrees/branches are in flight, you often want to see more than one
build live at the same time — each in its own Chrome window, clearly labeled so you
can tell which window is which. This is supported; it just takes two things per
instance.

## The two rules

1. **A separate Chrome profile per instance** (`--user-data-dir`). Chrome locks one
   profile to one running instance, so distinct profiles = independent windows that
   don't interfere. The `dev:chrome` harness derives the profile from the current
   folder (`.dev-chrome-profile` under `extension/`), so **running it from a
   different worktree automatically gives a different profile** — and a different
   `dist/`, hence a different build.
2. **A unique CDP port per instance** (`CDP_PORT`). `dev:chrome` *reuses* an instance
   if one is already answering on the port (`isUp()` check), so a second build on the
   default port (9222) silently attaches to the first instead of opening a new
   window. Give each its own port (9222, 9223, 9224, …).

## Labeling each build by purpose

Set `DEV_LABEL` at **build** time to a short purpose string. The build rewrites the
copied `dist/manifest.json` so the extension `name` becomes
`Focused Practice — <DEV_LABEL>` — which is what shows on `chrome://extensions` and as
the toolbar tooltip. The source manifest is left untouched.

> **Never set `DEV_LABEL` for a store/release build.** The published name must ship
> exactly as written in the manifest. `DEV_LABEL` is a dev-only convenience.

## Recipe

From each worktree's `extension/` directory:

```sh
# Worktree A — e.g. main
DEV_LABEL="main: icon" npm run build && CDP_PORT=9222 npm run dev:chrome

# Worktree B — e.g. chore/cws-store-compliance
DEV_LABEL="chore: store compliance" npm run build && CDP_PORT=9223 npm run dev:chrome

# Worktree C …  CDP_PORT=9224, etc.
```

Each line opens its own window, with its own profile, loading its own build, named
distinctly. After a rebuild, `CDP_PORT=<that port> npm run reload` refreshes that
instance in place.

## For future Claude sessions

When the user asks to "open another dev build" / test a second branch live:

1. **Pick a CDP port not already in use.** Check what's taken:
   ```sh
   for p in 9222 9223 9224 9333; do curl -s --max-time 1 localhost:$p/json/version | head -c 60; echo " <- :$p"; done
   ```
   A JSON `Browser` string means that port is occupied.
2. **Build that worktree with a descriptive label:**
   `DEV_LABEL="<branch>: <purpose>" npm run build`.
3. **Launch on the chosen port:** `CDP_PORT=<port> npm run dev:chrome`
   (optionally `DEV_URL='chrome://extensions'` to land on the page that shows the
   icon + name).
4. **Tell the user which port/window maps to which build** — the labels are only
   useful if you say what's what.

To work on `main` from a session whose main folder is checked out to another branch,
add a throwaway worktree first: `git worktree add /tmp/<name> main`, symlink
`extension/node_modules` from an existing checkout to skip reinstalling, then build
there. Remove it later with `git worktree remove /tmp/<name>`.

## Cleanup

- Stop one instance: close its window, or `pkill -f 'remote-debugging-port=<port>'`.
- Remove a throwaway worktree: `git worktree remove <path>`.
