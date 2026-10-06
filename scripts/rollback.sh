#!/usr/bin/env bash
# =============================================================================
# rollback.sh
# -----------------------------------------------------------------------------
# Restore the previous successful commit, reinstall/rebuild if needed, and
# reload PM2. Prefer pm2 reload; use pm2 restart only if reload fails.
#
# Usage:
#   ./scripts/rollback.sh
#   ./scripts/rollback.sh --sha <commit>
# =============================================================================

set -euo pipefail

# Same PATH/nvm bootstrap as deploy-beta.sh (non-interactive SSH).
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ -s "${NVM_DIR}/nvm.sh" ]]; then
  # shellcheck disable=SC1091
  . "${NVM_DIR}/nvm.sh"
fi
export PATH="${PATH}:/usr/local/bin:/usr/bin:${HOME}/.local/bin"
if command -v npm >/dev/null 2>&1; then
  _npm_bin="$(npm bin -g 2>/dev/null || true)"
  if [[ -n "${_npm_bin}" && -d "${_npm_bin}" ]]; then
    export PATH="${_npm_bin}:${PATH}"
  fi
fi
unset _npm_bin

if [[ -t 1 ]]; then
  C_RESET='\033[0m'
  C_RED='\033[0;31m'
  C_GREEN='\033[0;32m'
  C_YELLOW='\033[0;33m'
  C_BLUE='\033[0;34m'
  C_CYAN='\033[0;36m'
else
  C_RESET='' C_RED='' C_GREEN='' C_YELLOW='' C_BLUE='' C_CYAN=''
fi

ts() { date -u +'%Y-%m-%dT%H:%M:%SZ'; }
log_info()  { echo -e "$(ts) ${C_BLUE}[INFO]${C_RESET}  $*"; }
log_ok()    { echo -e "$(ts) ${C_GREEN}[OK]${C_RESET}    $*"; }
log_warn()  { echo -e "$(ts) ${C_YELLOW}[WARN]${C_RESET}  $*"; }
log_error() { echo -e "$(ts) ${C_RED}[ERROR]${C_RESET} $*" >&2; }
log_step()  { echo -e "$(ts) ${C_CYAN}[STEP]${C_RESET}  $*"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BRANCH="${BRANCH:-beta_development}"
PM2_APP_NAME="${PM2_APP_NAME:-cureka-backend}"
DEPLOYMENTS_DIR="${APP_ROOT}/.deployments"
PREVIOUS_SHA_FILE="${DEPLOYMENTS_DIR}/PREVIOUS_SHA"
CURRENT_SHA_FILE="${DEPLOYMENTS_DIR}/CURRENT_SHA"
ECOSYSTEM_FILE="${APP_ROOT}/ecosystem.config.js"
ROLLBACK_SHA="${ROLLBACK_SHA:-}"
FORCE_NPM_CI="${FORCE_NPM_CI:-0}"
SKIP_HEALTH="${SKIP_HEALTH:-0}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --sha) ROLLBACK_SHA="${2:?}"; shift 2 ;;
    --force-npm-ci) FORCE_NPM_CI=1; shift ;;
    --skip-health) SKIP_HEALTH=1; shift ;;
    --app-root)
      APP_ROOT="$(cd "${2:?}" && pwd)"
      SCRIPT_DIR="${APP_ROOT}/scripts"
      DEPLOYMENTS_DIR="${APP_ROOT}/.deployments"
      PREVIOUS_SHA_FILE="${DEPLOYMENTS_DIR}/PREVIOUS_SHA"
      CURRENT_SHA_FILE="${DEPLOYMENTS_DIR}/CURRENT_SHA"
      ECOSYSTEM_FILE="${APP_ROOT}/ecosystem.config.js"
      shift 2
      ;;
    -h|--help) sed -n '2,18p' "$0"; exit 0 ;;
    *) log_error "Unknown argument: $1"; exit 1 ;;
  esac
done

cd "${APP_ROOT}"

if [[ -z "${ROLLBACK_SHA}" ]]; then
  if [[ -f "${PREVIOUS_SHA_FILE}" ]]; then
    ROLLBACK_SHA="$(tr -d '[:space:]' < "${PREVIOUS_SHA_FILE}")"
  else
    log_error "No ROLLBACK_SHA provided and ${PREVIOUS_SHA_FILE} is missing"
    exit 1
  fi
fi

if [[ -z "${ROLLBACK_SHA}" ]]; then
  log_error "Rollback SHA is empty"
  exit 1
fi

log_step "Starting rollback to ${ROLLBACK_SHA}"
FAILED_SHA="$(git rev-parse HEAD 2>/dev/null || echo 'unknown')"
log_info "Current (failed) HEAD: ${FAILED_SHA}"

if ! git cat-file -e "${ROLLBACK_SHA}^{commit}" 2>/dev/null; then
  log_warn "Commit ${ROLLBACK_SHA} not found locally — fetching origin/${BRANCH}"
  git fetch --prune origin "${BRANCH}"
fi

if ! git cat-file -e "${ROLLBACK_SHA}^{commit}" 2>/dev/null; then
  log_error "Cannot find commit ${ROLLBACK_SHA} even after fetch"
  exit 1
fi

LOCK_BEFORE=""
[[ -f package-lock.json ]] && LOCK_BEFORE="$(sha256sum package-lock.json | awk '{print $1}')"

log_step "git reset --hard ${ROLLBACK_SHA}"
git reset --hard "${ROLLBACK_SHA}"

LOCK_AFTER=""
[[ -f package-lock.json ]] && LOCK_AFTER="$(sha256sum package-lock.json | awk '{print $1}')"

if [[ "${FORCE_NPM_CI}" == "1" || "${LOCK_BEFORE}" != "${LOCK_AFTER}" || ! -d node_modules ]]; then
  log_step "npm ci"
  npm ci
else
  log_info "Skipping npm ci — package-lock.json unchanged and node_modules present"
fi

log_step "npm run build"
npm run build

if [[ ! -f "${APP_ROOT}/dist/apps/api/main.js" ]]; then
  log_error "Build artifact missing: dist/apps/api/main.js"
  exit 1
fi

mkdir -p "${APP_ROOT}/logs"

reload_or_restart() {
  if [[ ! -f "${ECOSYSTEM_FILE}" ]]; then
    log_error "Missing ${ECOSYSTEM_FILE}"
    return 1
  fi

  if ! pm2 describe "${PM2_APP_NAME}" >/dev/null 2>&1; then
    log_warn "PM2 process ${PM2_APP_NAME} not found — starting"

    pm2 start "${ECOSYSTEM_FILE}" \
      --only "${PM2_APP_NAME}" \
      --update-env

    return $?
  fi

  log_step "pm2 reload ${PM2_APP_NAME} --update-env"

  if pm2 reload "${PM2_APP_NAME}" --update-env; then
    return 0
  fi

  log_warn "pm2 reload failed during rollback — falling back to targeted restart"

  pm2 restart "${PM2_APP_NAME}" --update-env
}

if ! reload_or_restart; then
  log_error "PM2 reload/restart failed during rollback"
  exit 1
fi

pm2 save || log_warn "pm2 save failed (non-fatal)"

if [[ "${SKIP_HEALTH}" != "1" ]]; then
  log_step "Post-rollback health check"
  if ! bash "${SCRIPT_DIR}/health-check.sh"; then
    log_error "Rollback health check FAILED — manual intervention required"
    echo "ROLLBACK_STATUS=failed"
    exit 1
  fi
fi

mkdir -p "${DEPLOYMENTS_DIR}/history"
echo "${ROLLBACK_SHA}" > "${CURRENT_SHA_FILE}"
echo "${FAILED_SHA}" > "${PREVIOUS_SHA_FILE}"

stamp="$(date -u +'%Y%m%dT%H%M%SZ')"
cat > "${DEPLOYMENTS_DIR}/history/${stamp}_${ROLLBACK_SHA:0:12}_rollback.json" <<EOF
{
  "type": "rollback",
  "sha": "${ROLLBACK_SHA}",
  "failedSha": "${FAILED_SHA}",
  "branch": "${BRANCH}",
  "timestamp": "$(ts)",
  "status": "success"
}
EOF

bash "${SCRIPT_DIR}/cleanup.sh" || log_warn "cleanup.sh non-zero (non-fatal)"

log_ok "Rollback succeeded → ${ROLLBACK_SHA}"
echo "ROLLBACK_STATUS=success"
echo "ROLLBACK_SHA=${ROLLBACK_SHA}"
exit 0
