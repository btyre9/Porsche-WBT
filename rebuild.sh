#!/usr/bin/env bash
# Usage:
#   bash rebuild.sh SLD-CC01-004        — promote one slide + full build
#   bash rebuild.sh                     — full build only (no promote)
set -e

SLIDE="$1"

if [ -n "$SLIDE" ]; then
  echo "→ Promoting $SLIDE..."
  python builder/promote_sandbox_slide.py --slide "$SLIDE" --force
  echo ""
fi

echo "→ Building..."
python builder/main.py --skip-captions

echo ""
echo "Done."
