#!/usr/bin/env bash
# deploy-pages.sh — publish the COMMITTED site to https://jiaxuanchen.pages.dev
# (Cloudflare Pages project `jiaxuanchen`, direct upload — it is not git-connected,
# so nothing goes live until this runs).
#
#   bash scripts/deploy-pages.sh            # deploy HEAD to production
#   bash scripts/deploy-pages.sh --dry-run  # build the staging folder and list it, no upload
#
# What gets uploaded = the files tracked at HEAD (git archive), so uncommitted work,
# .wolf/, .claude/, PROGRESS-BOARD.md and other gitignored/private files can never leak.
# Then repo-only files are stripped: notes/drafts (*.md except CREDITS.md, which carries
# the image-licence attributions), build scripts, package files, and functions/ (the
# old-hostname redirect belongs to the git-connected `cv` project only).
set -euo pipefail

PROJECT="jiaxuanchen"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -n "$(git status --porcelain -- index.html '*.js' '*.css' research humanities books products data)" ]; then
  echo "note: uncommitted site changes exist — they will NOT be deployed (only HEAD is)." >&2
fi

STAGE="$(mktemp -d "${TMPDIR:-/tmp}/cv-deploy.XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT
git archive HEAD | tar -x -C "$STAGE"

# strip repo-only files
find "$STAGE" -maxdepth 1 -name '*.md' ! -name 'CREDITS.md' -delete
rm -rf "$STAGE/scripts" "$STAGE/functions" "$STAGE/package.json" "$STAGE/package-lock.json" "$STAGE/.gitignore"

echo "staged $(find "$STAGE" -type f | wc -l | tr -d ' ') files from $(git rev-parse --short HEAD) → $PROJECT"
if [ "${1:-}" = "--dry-run" ]; then
  (cd "$STAGE" && find . -type f | sort | sed 's#^\./##' | head -400)
  exit 0
fi

npx --yes wrangler pages deploy "$STAGE" --project-name="$PROJECT" --branch=main --commit-dirty=true
