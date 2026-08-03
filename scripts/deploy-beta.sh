#!/usr/bin/env bash
# =============================================================================
# deploy-beta.sh
# -----------------------------------------------------------------------------
# Simple near-zero-downtime deploy for the Cureka NestJS API on a Debian VM.
#
# Pipeline:
#   1. git fetch + reset --hard origin/beta_development
#   2. npm ci ONLY if package-lock.json changed (or node_modules missing)
#   3. nest build (skip when sources unchanged and dist exists)
#   4. verify dist/apps/api/main.js exists
#   5. npm run migration:run
#   6. pm2 reload ecosystem.config.js --update-env
#   7. health check (GET /api/v1/health → 200)
#
# Exit codes:
#   0 — deploy succeeded
#   1 — deploy failed (fail fast; no automatic rollback)
#
# Usage (on the VM):
#   cd /var/www/Cureka-backend && ./scripts/deploy-beta.sh
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Coloured, timestamped logging
# ---------------------------------------------------------------------------
if [[ -t 1 ]]; then
  C_RESET='\033[0m'
  C_RED='\033[0;31m'
  C_GREEN='\033[0;32m'
  C_YELLOW='\033[0;33m'
  C_BLUE='\033[0;34m'
  C_CYAN='\033[0;36m'
  C_MAGENTA='\033[0;35m'
else
  C_RESET='' C_RED='' C_GREEN='' C_YELLOW='' C_BLUE='' C_CYAN='' C_MAGENTA=''
fi

ts() { date -u +'%Y-%m-%dT%H:%M:%SZ'; }
log_info()  { echo -e "$(ts) ${C_BLUE}[INFO]${C_RESET}  $*"; }
log_ok()    { echo -e "$(ts) ${C_GREEN}[OK]${C_RESET}    $*"; }
log_warn()  { echo -e "$(ts) ${C_YELLOW}[WARN]${C_RESET}  $*"; }
log_error() { echo -e "$(ts) ${C_RED}[ERROR]${C_RESET} $*" >&2; }
log_step()  { echo -e "$(ts) ${C_CYAN}[STEP]${C_RESET}  $*"; }
log_phase() { echo -e "$(ts) ${C_MAGENTA}[PHASE]${C_RESET} $*"; }

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BRANCH="${BRANCH:-beta_development}"
PM2_APP_NAME="${PM2_APP_NAME:-cureka-api}"
REMOTE="${REMOTE:-origin}"
FORCE_NPM_CI="${FORCE_NPM_CI:-0}"
FORCE_BUILD="${FORCE_BUILD:-0}"
SKIP_HEALTH="${SKIP_HEALTH:-0}"
SKIP_MIGRATIONS="${SKIP_MIGRATIONS:-0}"
ECOSYSTEM_FILE="${APP_ROOT}/ecosystem.config.js"
BUILD_ARTIFACT="${APP_ROOT}/dist/apps/api/main.js"

DEPLOY_STARTED_AT="$(ts)"
DEPLOY_STATUS="failed"
PREVIOUS_SHA=""
TARGET_SHA=""
DID_NPM_CI=0
DID_BUILD=0
DID_MIGRATIONS=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force-npm-ci) FORCE_NPM_CI=1; shift ;;
    --force-build)  FORCE_BUILD=1; shift ;;
    --skip-health)  SKIP_HEALTH=1; shift ;;
    --skip-migrations) SKIP_MIGRATIONS=1; shift ;;
    --branch)
      BRANCH="${2:?}"
      shift 2
      ;;
    --app-root)
      APP_ROOT="$(cd "${2:?}" && pwd)"
      SCRIPT_DIR="${APP_ROOT}/scripts"
      ECOSYSTEM_FILE="${APP_ROOT}/ecosystem.config.js"
      BUILD_ARTIFACT="${APP_ROOT}/dist/apps/api/main.js"
      shift 2
      ;;
    -h|--help)
      sed -n '2,30p' "$0"
      exit 0
      ;;
    *)
      log_error "Unknown argument: $1"
      exit 1
      ;;
  esac
done

cd "${APP_ROOT}"

print_summary() {
  local ended
  ended="$(ts)"
  echo ""
  echo "============================================================"
  echo " DEPLOYMENT SUMMARY"
  echo "============================================================"
  echo " Status:          ${DEPLOY_STATUS}"
  echo " Branch:          ${BRANCH}"
  echo " Previous SHA:    ${PREVIOUS_SHA:-n/a}"
  echo " Target SHA:      ${TARGET_SHA:-n/a}"
  echo " npm ci ran:      ${DID_NPM_CI}"
  echo " build ran:       ${DID_BUILD}"
  echo " migrations ran:  ${DID_MIGRATIONS}"
  echo " Started (UTC):   ${DEPLOY_STARTED_AT}"
  echo " Finished (UTC):  ${ended}"
  echo " App root:        ${APP_ROOT}"
  echo "============================================================"
}
trap print_summary EXIT

fail_deploy() {
  log_error "$1"
  DEPLOY_STATUS="failed"
  exit 1
}

# ---------------------------------------------------------------------------
# Preconditions
# ---------------------------------------------------------------------------
log_phase "Beta deploy starting (branch=${BRANCH})"

command -v git >/dev/null 2>&1 || fail_deploy "git is required"
command -v npm >/dev/null 2>&1 || fail_deploy "npm is required"
command -v node >/dev/null 2>&1 || fail_deploy "node is required"
command -v pm2 >/dev/null 2>&1 || fail_deploy "pm2 is required"

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [[ "${NODE_MAJOR}" -lt 20 ]]; then
  fail_deploy "Node ${NODE_MAJOR} detected; Cureka requires Node 22 (minimum 20)"
fi
log_info "Node $(node -v) | npm $(npm -v) | PM2 $(pm2 -v)"

mkdir -p "${APP_ROOT}/logs"

PREVIOUS_SHA="$(git rev-parse HEAD)"
log_info "Current HEAD before deploy: ${PREVIOUS_SHA}"

LOCK_BEFORE=""
[[ -f package-lock.json ]] && LOCK_BEFORE="$(sha256sum package-lock.json | awk '{print $1}')"

# Paths that affect Nest build output / runtime entrypoint.
build_paths=(
  "apps"
  "modules"
  "packages"
  "nest-cli.json"
  "tsconfig.json"
  "tsconfig.build.json"
  "package.json"
  "package-lock.json"
)

# ---------------------------------------------------------------------------
# Fetch + hard reset to remote branch tip
# ---------------------------------------------------------------------------
log_step "git fetch --prune ${REMOTE} ${BRANCH}"
git fetch --prune "${REMOTE}" "${BRANCH}"

log_step "git reset --hard ${REMOTE}/${BRANCH}"
git reset --hard "${REMOTE}/${BRANCH}"

# Removes untracked clutter; ignored files (.env, logs/) are kept.
git clean -fd

TARGET_SHA="$(git rev-parse HEAD)"
log_ok "Now at ${TARGET_SHA} ($(git rev-parse --short HEAD))"

# ---------------------------------------------------------------------------
# Dependencies — biggest time saver when lockfile is unchanged
# ---------------------------------------------------------------------------
LOCK_AFTER=""
[[ -f package-lock.json ]] && LOCK_AFTER="$(sha256sum package-lock.json | awk '{print $1}')"

need_npm_ci=0
if [[ "${FORCE_NPM_CI}" == "1" ]]; then
  need_npm_ci=1
elif [[ ! -d node_modules ]]; then
  need_npm_ci=1
elif [[ "${LOCK_BEFORE}" != "${LOCK_AFTER}" ]]; then
  need_npm_ci=1
fi

if (( need_npm_ci == 1 )); then
  log_step "npm ci (package-lock changed, node_modules missing, or forced)"
  # Do not use --omit=dev — Nest build + TypeORM migrations need devDependencies.
  if ! npm ci; then
    fail_deploy "npm ci failed"
  fi
  DID_NPM_CI=1
  FORCE_BUILD=1
else
  log_info "Skipping npm ci — package-lock.json unchanged and node_modules present"
fi

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
need_build=0
if [[ "${FORCE_BUILD}" == "1" ]]; then
  need_build=1
elif [[ ! -f "${BUILD_ARTIFACT}" ]]; then
  need_build=1
elif [[ "${PREVIOUS_SHA}" != "${TARGET_SHA}" ]]; then
  if ! git diff --quiet "${PREVIOUS_SHA}" "${TARGET_SHA}" -- "${build_paths[@]}"; then
    need_build=1
  fi
fi

if (( need_build == 1 )); then
  log_step "npm run build"
  if ! npm run build; then
    fail_deploy "npm run build failed"
  fi
  DID_BUILD=1
else
  log_info "Skipping build — no source/config changes affecting Nest output since ${PREVIOUS_SHA:0:12}"
fi

# Always verify the PM2 entrypoint exists before reload.
if [[ ! -f "${BUILD_ARTIFACT}" ]]; then
  fail_deploy "Build artifact missing: dist/apps/api/main.js — refusing to reload PM2"
fi
log_ok "Build artifact present: dist/apps/api/main.js"

# ---------------------------------------------------------------------------
# Migrations — always run (TypeORM no-ops when already applied)
# ---------------------------------------------------------------------------
if [[ "${SKIP_MIGRATIONS}" == "1" ]]; then
  log_warn "SKIP_MIGRATIONS=1 — skipping npm run migration:run"
else
  log_step "npm run migration:run"
  if ! npm run migration:run; then
    fail_deploy "npm run migration:run failed"
  fi
  DID_MIGRATIONS=1
fi

# ---------------------------------------------------------------------------
# PM2 reload (near-zero downtime) — never restart on the success path
# ---------------------------------------------------------------------------
if [[ ! -f "${ECOSYSTEM_FILE}" ]]; then
  fail_deploy "Missing ${ECOSYSTEM_FILE}"
fi

log_step "PM2 reload (cluster rolling update)"
if ! pm2 describe "${PM2_APP_NAME}" >/dev/null 2>&1; then
  log_warn "PM2 app ${PM2_APP_NAME} not running — initial start"
  if ! pm2 start "${ECOSYSTEM_FILE}" --update-env; then
    fail_deploy "pm2 start failed"
  fi
else
  if ! pm2 reload "${ECOSYSTEM_FILE}" --update-env; then
    fail_deploy "pm2 reload failed"
  fi
fi

pm2 save || log_warn "pm2 save failed (non-fatal)"

# ---------------------------------------------------------------------------
# Health check — must hit a real 200 endpoint
# ---------------------------------------------------------------------------
if [[ "${SKIP_HEALTH}" == "1" ]]; then
  log_warn "SKIP_HEALTH=1 — skipping post-deploy health check"
else
  log_step "Post-deploy health check (expect HTTP 200 on /api/v1/health)"
  if ! bash "${SCRIPT_DIR}/health-check.sh"; then
    fail_deploy "Health check failed after deploy"
  fi
fi

DEPLOY_STATUS="success"
log_ok "Deployment succeeded → ${TARGET_SHA}"
echo "DEPLOY_STATUS=success"
echo "DEPLOY_SHA=${TARGET_SHA}"
exit 0
