#!/usr/bin/env bash
# Stop-hook helper (wired up by the project Stop hook in .claude/settings.json).
#
# When anything under extension/src has changed since the last build, rebuild the unpacked
# Chrome dev bundle, LABEL it per working tree via DEV_LABEL (so the extension shows as
# "Focused Practice — <label>" in chrome://extensions and side-by-side dev builds are tellable
# apart), and report that label back to the user as a systemMessage.
#
# Arg $1 is the repo root (the hook passes the session .cwd). Falls back to the current dir.
set -uo pipefail

CWD="${1:-$(pwd)}"
EXT="$CWD/extension"
[ -d "$EXT" ] || exit 0

# Only rebuild when source actually changed since the last build (or there is no build yet),
# so plain conversational turns don't trigger a build.
if [ -f "$EXT/dist/content.js" ] && [ -z "$(find "$EXT/src" -newer "$EXT/dist/content.js" 2>/dev/null | head -1)" ]; then
  exit 0
fi

# Label by working-tree directory name so multiple dev builds are distinguishable.
LABEL="$(basename "$CWD")"

if ( cd "$EXT" && DEV_LABEL="$LABEL" npm run build ) >/tmp/fp-autobuild.log 2>&1; then
  printf '{"systemMessage":"🔨 Auto-rebuilt extension/dist — loads as \\"Focused Practice — %s\\" in chrome://extensions. Reload the unpacked extension + hard-refresh CB to see changes."}' "$LABEL"
else
  printf '{"systemMessage":"⚠️ Auto-build FAILED — see /tmp/fp-autobuild.log"}'
fi
exit 0
