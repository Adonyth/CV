#!/usr/bin/env bash
# deploy-pages.sh — publish the COMMITTED site to Cloudflare Pages project `jiaxuanchen`
# and then VERIFY that what is live is byte-identical to the commit (closed loop).
#
#   bash scripts/deploy-pages.sh                    # deploy HEAD to production (https://jiaxuanchen.pages.dev)
#   bash scripts/deploy-pages.sh --branch lss-wip   # preview → https://lss-wip.jiaxuanchen.pages.dev
#   bash scripts/deploy-pages.sh --dry-run          # build the staging folder and list it, no upload
#
# Normally you never run this by hand: .github/workflows/deploy.yml runs it on every push
# (main → production, any other branch → preview). Locally it uses your `wrangler login`;
# in CI it uses CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID from the environment.
#
# What gets uploaded = the files tracked at HEAD (git archive), so uncommitted work,
# .wolf/, .claude/, PROGRESS-BOARD.md and other gitignored/private files can never leak.
# Repo-only files are then stripped: notes/drafts (*.md except CREDITS.md, which carries
# the image-licence attributions), build scripts, package files, CI config, and functions/
# (the old-hostname redirect belongs to the git-connected `cv` project only).
set -euo pipefail

PROJECT="jiaxuanchen"
PROD_URL="https://jiaxuanchen.pages.dev"
BRANCH="main"; DRY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --branch) BRANCH="${2:?--branch needs a name}"; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
SHA="$(git rev-parse HEAD)"
md5() { python3 -c 'import hashlib,sys;print(hashlib.md5(sys.stdin.buffer.read()).hexdigest())'; }
WANT_MD5="$(git show HEAD:index.html | md5)"

if [ -n "$(git status --porcelain -- index.html '*.js' '*.css' research humanities books products data 2>/dev/null)" ]; then
  echo "note: uncommitted site changes exist — they will NOT be deployed (only HEAD is)." >&2
fi

STAGE="$(mktemp -d "${TMPDIR:-/tmp}/cv-deploy.XXXXXX")"
LOG="$(mktemp "${TMPDIR:-/tmp}/cv-deploy-log.XXXXXX")"
trap 'rm -rf "$STAGE" "$LOG"' EXIT
git archive HEAD | tar -x -C "$STAGE"

# strip repo-only files
find "$STAGE" -maxdepth 1 -name '*.md' ! -name 'CREDITS.md' -delete
rm -rf "$STAGE/scripts" "$STAGE/functions" "$STAGE/.github" \
       "$STAGE/package.json" "$STAGE/package-lock.json" "$STAGE/.gitignore"

echo "staged $(find "$STAGE" -type f | wc -l | tr -d ' ') files from ${SHA:0:7} → $PROJECT ($BRANCH)"
if [ "$DRY" = 1 ]; then
  (cd "$STAGE" && find . -type f | sort | sed 's#^\./##')
  exit 0
fi

# run FROM the staging folder: wrangler looks for functions/ in the current directory,
# not in the uploaded one — deploying from the repo root would ship the redirect here too.
( cd "$STAGE" && npx --yes wrangler@4 pages deploy . --project-name="$PROJECT" --branch="$BRANCH" \
    --commit-hash="$SHA" --commit-dirty=true ) 2>&1 | tee "$LOG"

DEPLOY_URL="$(grep -oE 'https://[a-z0-9-]+\.'"$PROJECT"'\.pages\.dev' "$LOG" | tail -1 || true)"
[ -n "$DEPLOY_URL" ] || { echo "VERIFY FAIL: could not find the deployment URL in wrangler output" >&2; exit 1; }

# ---- closed loop: what is live must be exactly this commit ----
check() {  # $1 = base URL; retries because a fresh deployment can take a few seconds to serve
  local base="$1" got="" i
  for i in $(seq 1 18); do
    got="$(curl -sL --max-time 20 "$base/" | md5 || true)"
    [ "$got" = "$WANT_MD5" ] && break
    sleep 5
  done
  if [ "$got" != "$WANT_MD5" ]; then
    echo "VERIFY FAIL: $base/ serves md5 $got, commit has $WANT_MD5" >&2; return 1
  fi
  local canon
  canon="$(curl -sL --max-time 20 "$base/" | grep -oE 'rel="canonical" href="[^"]+"' | head -1)"
  case "$canon" in *"$PROD_URL/"*) ;; *) echo "VERIFY FAIL: unexpected canonical: $canon" >&2; return 1 ;; esac
  for p in research/ringdown.html cv.html data/works.json; do
    local code; code="$(curl -sL -o /dev/null --max-time 20 -w '%{http_code}' "$base/$p")"
    [ "$code" = 200 ] || { echo "VERIFY FAIL: $base/$p → HTTP $code" >&2; return 1; }
  done
  echo "VERIFIED: $base serves commit ${SHA:0:7} (index md5 match, canonical ok, key pages 200)"
}

check "$DEPLOY_URL"
if [ "$BRANCH" = "main" ]; then check "$PROD_URL"; else check "https://$(echo "$BRANCH" | tr '/_' '--' | tr 'A-Z' 'a-z').$PROJECT.pages.dev" || true; fi
