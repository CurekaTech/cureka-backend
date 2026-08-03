#!/usr/bin/env bash
# =============================================================================
# deploy-beta.sh
# -----------------------------------------------------------------------------
# Near-zero-downtime deploy for Cureka NestJS API on the beta Debian VM.
# All deployment logic lives in Git — the server only executes this script.
#
# Flow:
#   git fetch
#   git reset --hard origin/beta_development
#   git clean -fd
#   npm ci          (only if package-lock changed)
#   npm run build   (only if source changed)
#   pm2 reload ecosystem.config.js --update-env
#   health check (GET /api/v1/health → 200)
#   on failure → rollback.sh
#
# Migrations are manual — this script never runs migration:run.
#
# Usage:
#   ./scripts/deploy-beta.sh
# =============================================================================

set -euo pipefail

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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BRANCH="${BRANCH:-beta_development}"
PM2_APP_NAME="${PM2_APP_NAME:-cureka-backend}"
REMOTE="${REMOTE:-origin}"
FORCE_NPM_CI="${FORCE_NPM_CI:-0}"
FORCE_BUILD="${FORCE_BUILD:-0}"
SKIP_HEALTH="${SKIP_HEALTH:-0}"
SKIP_ROLLBACK="${SKIP_ROLLBACK:-0}"

DEPLOYMENTS_DIR="${APP_ROOT}/.deployments"
PREVIOUS_SHA_FILE="${DEPLOYMENTS_DIR}/PREVIOUS_SHA"
CURRENT_SHA_FILE="${DEPLOYMENTS_DIR}/CURRENT_SHA"
HISTORY_DIR="${DEPLOYMENTS_DIR}/history"
ECOSYSTEM_FILE="${APP_ROOT}/ecosystem.config.js"
BUILD_ARTIFACT="${APP_ROOT}/dist/apps/api/main.js"

DEPLOY_STARTED_AT="$(ts)"
DEPLOY_STATUS="failed"
PREVIOUS_SHA=""
TARGET_SHA=""
DID_NPM_CI=0
DID_BUILD=0
ROLLBACK_STATUS="not_attempted"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force-npm-ci) FORCE_NPM_CI=1; shift ;;
    --force-build) FORCE_BUILD=1; shift ;;
    --skip-health) SKIP_HEALTH=1; shift ;;
    --skip-rollback) SKIP_ROLLBACK=1; shift ;;
    --branch) BRANCH="${2:?}"; shift 2 ;;
    --app-root)
      APP_ROOT="$(cd "${2:?}" && pwd)"
      SCRIPT_DIR="${APP_ROOT}/scripts"
      DEPLOYMENTS_DIR="${APP_ROOT}/.deployments"
      PREVIOUS_SHA_FILE="${DEPLOYMENTS_DIR}/PREVIOUS_SHA"
      CURRENT_SHA_FILE="${DEPLOYMENTS_DIR}/CURRENT_SHA"
      HISTORY_DIR="${DEPLOYMENTS_DIR}/history"
      ECOSYSTEM_FILE="${APP_ROOT}/ecosystem.config.js"
      BUILD_ARTIFACT="${APP_ROOT}/dist/apps/api/main.js"
      shift 2
      ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) log_error "Unknown argument: $1"; exit 1 ;;
  esac
done

cd "${APP_ROOT}"

print_summary() {
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
  echo " Rollback:        ${ROLLBACK_STATUS}"
  echo " Started (UTC):   ${DEPLOY_STARTED_AT}"
  echo " Finished (UTC):  $(ts)"
  echo " App root:        ${APP_ROOT}"
  echo "============================================================"
}
trap print_summary EXIT

fail_deploy() {
  log_error "$1"
  DEPLOY_STATUS="failed"

  if [[ "${SKIP_ROLLBACK}" == "1" ]]; then
    ROLLBACK_STATUS="skipped"
    exit 1
  fi

  if [[ -z "${PREVIOUS_SHA}" || "${PREVIOUS_SHA}" == "${TARGET_SHA}" ]]; then
    log_error "No safer previous SHA available for rollback"
    ROLLBACK_STATUS="unavailable"
    exit 1
  fi

  log_phase "Automatic rollback → ${PREVIOUS_SHA}"
  if bash "${SCRIPT_DIR}/rollback.sh" --sha "${PREVIOUS_SHA}"; then
    ROLLBACK_STATUS="success"
    log_warn "Deploy failed; rollback succeeded"
  else
    ROLLBACK_STATUS="failed"
    log_error "Deploy failed; rollback ALSO failed — manual intervention required"
  fi
  exit 1
}

log_phase "Beta deploy starting (branch=${BRANCH})"

command -v git >/dev/null 2>&1 || fail_deploy "git is required"
command -v npm >/dev/null 2>&1 || fail_deploy "npm is required"
command -v node >/dev/null 2>&1 || fail_deploy "node is required"
command -v pm2 >/dev/null 2>&1 || fail_deploy "pm2 is required"

log_info "Node $(node -v) | npm $(npm -v) | PM2 $(pm2 -v)"

mkdir -p "${DEPLOYMENTS_DIR}" "${HISTORY_DIR}" "${APP_ROOT}/logs"

PREVIOUS_SHA="$(git rev-parse HEAD)"
echo "${PREVIOUS_SHA}" > "${PREVIOUS_SHA_FILE}"
log_info "Recorded PREVIOUS_SHA=${PREVIOUS_SHA}"

LOCK_BEFORE=""
[[ -f package-lock.json ]] && LOCK_BEFORE="$(sha256sum package-lock.json | awk '{print $1}')"

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
# Sync to origin/beta_development
# ---------------------------------------------------------------------------
log_step "git fetch --prune ${REMOTE} ${BRANCH}"
git fetch --prune "${REMOTE}" "${BRANCH}"

log_step "git reset --hard ${REMOTE}/${BRANCH}"
git reset --hard "${REMOTE}/${BRANCH}"

log_step "git clean -fd"
git clean -fd

TARGET_SHA="$(git rev-parse HEAD)"
log_ok "Now at ${TARGET_SHA} ($(git rev-parse --short HEAD))"

# ---------------------------------------------------------------------------
# npm ci only if package-lock changed
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
  log_step "npm ci"
  if ! npm ci; then
    fail_deploy "npm ci failed"
  fi
  DID_NPM_CI=1
  FORCE_BUILD=1
else
  log_info "Skipping npm ci — package-lock.json unchanged"
fi

# ---------------------------------------------------------------------------
# build only if source changed
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
  log_info "Skipping build — no source changes affecting Nest output"
fi

if [[ ! -f "${BUILD_ARTIFACT}" ]]; then
  fail_deploy "Build artifact missing: dist/apps/api/main.js — refusing to reload PM2"
fi
log_ok "Build artifact present: dist/apps/api/main.js"

# ---------------------------------------------------------------------------
# PM2 reload — never restart on success path
# ---------------------------------------------------------------------------
if [[ ! -f "${ECOSYSTEM_FILE}" ]]; then
  fail_deploy "Missing ${ECOSYSTEM_FILE}"
fi

log_step "pm2 reload ecosystem.config.js --update-env"
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
# Health check → rollback on failure
# ---------------------------------------------------------------------------
if [[ "${SKIP_HEALTH}" == "1" ]]; then
  log_warn "SKIP_HEALTH=1 — skipping post-deploy health check"
else
  log_step "Post-deploy health check"
  if ! bash "${SCRIPT_DIR}/health-check.sh"; then
    fail_deploy "Health check failed after deploy"
  fi
fi

# ---------------------------------------------------------------------------
# Record success + keep last 5
# ---------------------------------------------------------------------------
echo "${TARGET_SHA}" > "${CURRENT_SHA_FILE}"

stamp="$(date -u +'%Y%m%dT%H%M%SZ')"
cat > "${HISTORY_DIR}/${stamp}_${TARGET_SHA:0:12}.json" <<EOF
{
  "type": "deploy",
  "sha": "${TARGET_SHA}",
  "previousSha": "${PREVIOUS_SHA}",
  "branch": "${BRANCH}",
  "timestamp": "$(ts)",
  "status": "success",
  "npmCi": ${DID_NPM_CI},
  "built": ${DID_BUILD}
}
EOF

bash "${SCRIPT_DIR}/cleanup.sh" || log_warn "cleanup.sh non-zero (non-fatal)"

DEPLOY_STATUS="success"
log_ok "Deployment succeeded → ${TARGET_SHA}"
echo "DEPLOY_STATUS=success"
echo "DEPLOY_SHA=${TARGET_SHA}"
exit 0
