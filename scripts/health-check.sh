#!/usr/bin/env bash
# =============================================================================
# health-check.sh
# -----------------------------------------------------------------------------
# Polls GET /api/v1/health until HTTP 200 or retries are exhausted.
#
# Default URL: http://127.0.0.1:${PORT}/api/v1/health
# Retries: 15 attempts, 2 seconds apart
#
# Exit 0 = healthy | Exit 1 = unhealthy
# =============================================================================

set -euo pipefail

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
DEFAULT_PORT=3000

if [[ -f "${APP_ROOT}/.env" ]]; then
  _port_line="$(grep -E '^[[:space:]]*PORT=' "${APP_ROOT}/.env" | tail -n1 || true)"
  if [[ -n "${_port_line}" ]]; then
    DEFAULT_PORT="${_port_line#*=}"
    DEFAULT_PORT="${DEFAULT_PORT//\"/}"
    DEFAULT_PORT="${DEFAULT_PORT//\'/}"
    DEFAULT_PORT="$(echo "${DEFAULT_PORT}" | tr -d '[:space:]')"
  fi
fi

# Prefer explicit PORT env, then .env, then 3000.
PORT="${PORT:-${DEFAULT_PORT}}"
HEALTH_CHECK_URL="${HEALTH_CHECK_URL:-http://127.0.0.1:${PORT}/api/v1/health}"
HEALTH_RETRIES="${HEALTH_RETRIES:-15}"
HEALTH_INTERVAL="${HEALTH_INTERVAL:-2}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-5}"
HEALTH_EXPECT="${HEALTH_EXPECT:-200}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --url) HEALTH_CHECK_URL="${2:?}"; shift 2 ;;
    --retries) HEALTH_RETRIES="${2:?}"; shift 2 ;;
    --interval) HEALTH_INTERVAL="${2:?}"; shift 2 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) log_error "Unknown argument: $1"; exit 1 ;;
  esac
done

if ! command -v curl >/dev/null 2>&1; then
  log_error "curl is required but not installed"
  exit 1
fi

log_step "Health check → ${HEALTH_CHECK_URL}"
log_info "Expect HTTP ${HEALTH_EXPECT}; retries=${HEALTH_RETRIES}; interval=${HEALTH_INTERVAL}s"

attempt=1
while (( attempt <= HEALTH_RETRIES )); do
  http_code="$(
    curl -sS \
      -o /dev/null \
      -w '%{http_code}' \
      --max-time "${HEALTH_TIMEOUT}" \
      --connect-timeout "${HEALTH_TIMEOUT}" \
      "${HEALTH_CHECK_URL}" \
      2>/dev/null || echo "000"
  )"

  if [[ "${http_code}" == "${HEALTH_EXPECT}" ]]; then
    log_ok "Health check passed (HTTP ${http_code}) on attempt ${attempt}/${HEALTH_RETRIES}"
    exit 0
  fi

  log_warn "Attempt ${attempt}/${HEALTH_RETRIES}: got HTTP ${http_code}, waiting ${HEALTH_INTERVAL}s…"
  sleep "${HEALTH_INTERVAL}"
  attempt=$((attempt + 1))
done

log_error "Health check FAILED after ${HEALTH_RETRIES} attempts → ${HEALTH_CHECK_URL}"
exit 1
