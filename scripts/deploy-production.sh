#!/usr/bin/env bash

set -Eeuo pipefail

EXPECTED_SHA="${1:?Expected Git commit SHA is required}"
PM2_APP_NAME="${2:-crm-backend}"
PUBLIC_URL="${3:-https://crmananttattva.com}"
APP_DIR="$(pwd -P)"
LOCK_FILE="/tmp/crmananttattva-production-deploy.lock"
PREVIOUS_SHA="$(git rev-parse HEAD)"
NEXT_DIST=""
BACKUP_DIST=""
FRONTEND_SWAPPED=false
HAD_PREVIOUS_DIST=false
CODE_UPDATED=false

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Another CRM deployment is already running."
  exit 1
fi

cleanup_build_directory() {
  if [[ -n "$NEXT_DIST" && -d "$NEXT_DIST" ]]; then
    rm -rf -- "$NEXT_DIST"
  fi
}

rollback_deployment() {
  local exit_code=$?
  trap - ERR
  echo "Deployment failed; restoring the previous working release ${PREVIOUS_SHA:0:12}."

  if [[ "$FRONTEND_SWAPPED" == true ]]; then
    rm -rf -- "$APP_DIR/frontend/dist"
    if [[ "$HAD_PREVIOUS_DIST" == true && -n "$BACKUP_DIST" && -d "$BACKUP_DIST" ]]; then
      mv -- "$BACKUP_DIST" "$APP_DIR/frontend/dist"
    fi
  fi
  cleanup_build_directory

  if [[ "$CODE_UPDATED" == true ]]; then
    git reset --hard "$PREVIOUS_SHA"
    npm ci --prefix backend --omit=dev || true
    DEPLOY_COMMIT="$PREVIOUS_SHA" pm2 restart "$PM2_APP_NAME" --update-env || true
  fi

  exit "$exit_code"
}

trap rollback_deployment ERR

if [[ "$(git rev-parse --is-inside-work-tree)" != "true" ]]; then
  echo "APP_DIR is not a Git worktree: $APP_DIR"
  exit 1
fi

if [[ "$(git branch --show-current)" != "main" ]]; then
  echo "Production worktree must be on the main branch."
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Tracked server files have local changes. Deployment stopped to protect them."
  git status --short
  exit 1
fi

git fetch --prune origin main

if ! git cat-file -e "${EXPECTED_SHA}^{commit}" 2>/dev/null; then
  echo "Expected commit does not exist on the server: $EXPECTED_SHA"
  exit 1
fi

REMOTE_SHA="$(git rev-parse origin/main)"
if [[ "$REMOTE_SHA" != "$EXPECTED_SHA" ]]; then
  echo "origin/main is $REMOTE_SHA but the workflow requested $EXPECTED_SHA."
  exit 1
fi

if ! git merge-base --is-ancestor "$PREVIOUS_SHA" "$EXPECTED_SHA"; then
  echo "Deployment is not a fast-forward from the current production commit."
  exit 1
fi

git merge --ff-only "$EXPECTED_SHA"
CODE_UPDATED=true

npm ci --prefix backend --omit=dev
npm ci --prefix frontend
node --check backend/src/index.js

NEXT_DIST="$(mktemp -d "$APP_DIR/frontend/.dist-next.XXXXXX")"
CRM_FRONTEND_OUT_DIR="$NEXT_DIST" npm run build --prefix frontend
test -s "$NEXT_DIST/index.html"

BACKUP_DIST="$APP_DIR/frontend/.dist-previous-$(date +%s)"
if [[ -d "$APP_DIR/frontend/dist" ]]; then
  HAD_PREVIOUS_DIST=true
  mv -- "$APP_DIR/frontend/dist" "$BACKUP_DIST"
fi
mv -- "$NEXT_DIST" "$APP_DIR/frontend/dist"
NEXT_DIST=""
FRONTEND_SWAPPED=true

pm2 describe "$PM2_APP_NAME" >/dev/null
DEPLOY_COMMIT="$EXPECTED_SHA" pm2 restart "$PM2_APP_NAME" --update-env

for attempt in {1..12}; do
  if curl --fail --silent --show-error --max-time 10 http://127.0.0.1:4000/api/health >/dev/null; then
    break
  fi
  if [[ "$attempt" == 12 ]]; then
    echo "Backend health check did not recover after PM2 restart."
    false
  fi
  sleep 5
done

nginx -t
systemctl reload nginx
curl --fail --silent --show-error --location --retry 5 --retry-delay 3 --retry-all-errors --max-time 20 "$PUBLIC_URL/api/health" >/dev/null
pm2 save

if [[ -n "$BACKUP_DIST" && -d "$BACKUP_DIST" ]]; then
  rm -rf -- "$BACKUP_DIST"
fi

FRONTEND_SWAPPED=false
CODE_UPDATED=false
trap - ERR

echo "CRM production deployment completed: ${EXPECTED_SHA:0:12}"
