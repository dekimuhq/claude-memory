#!/usr/bin/env bash
# Install the memory-review skill into ~/.claude/skills and print the remaining
# manual wiring (CLAUDE.md conventions block + SessionStart hook).
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILLS_DIR="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"
DEST="$SKILLS_DIR/memory-review"

mkdir -p "$SKILLS_DIR"
if [ -e "$DEST" ]; then
  echo "warning: $DEST already exists — overwriting" >&2
  rm -rf "$DEST"
fi
cp -r "$REPO_DIR/skill" "$DEST"
echo "Installed skill → $DEST"

cat <<'EOF'

────────────────────────────────────────────────────────────────────────
Two manual steps remain:

1. Set MEMORY_DIR (the directory of one-fact-per-file .md notes), e.g. in
   your shell profile or settings.json env:

       export MEMORY_DIR="$HOME/.claude/memory"

2. Wire the SessionStart hook in ~/.claude/settings.json. Point it at the
   installed copy (or this repo's hooks/session-nudge.mjs):

   {
     "hooks": {
       "SessionStart": [
         { "hooks": [
             { "type": "command",
               "command": "MEMORY_DIR=$HOME/.claude/memory node /ABS/PATH/TO/claude-memory/hooks/session-nudge.mjs" }
         ]}
       ]
     }
   }

3. Add the memory conventions to ~/.claude/CLAUDE.md so Claude writes notes in
   the expected format. The full contract is in SCHEMA.md — at minimum tell it:
   one fact per file, frontmatter with name/description/type, and for
   feedback/project notes the confidence/created/last_confirmed/reaffirm_count
   fields on the {0.3, 0.5, 0.7, 0.9} bands.
────────────────────────────────────────────────────────────────────────
EOF
