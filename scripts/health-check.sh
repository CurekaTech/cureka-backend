#!/usr/bin/env bash
# =============================================================================
# health-check.sh
# -----------------------------------------------------------------------------
# Polls a configurable HTTP health endpoint until it succeeds or times out.
#
# Why this exists:
# - Confirms PM2 workers are actually serving traffic after reload/rollback.
# - Used by deploy-beta.sh and rollback.sh; safe to run standalone.
#
# Exit codes:
#   0 — endpoint returned an acceptable HTTP status
#   1 — timed out or curl/tooling failure
#
# Environment / flags:
#   HEALTH_CHECK_URL   Full URL (default: http://127.0.0.1:3000/api/v1/health)
#   HEALTH_RETRIES     Max attempts (default: 30)
#   HEALTH_INTERVAL    Seconds between attempts (default: 2)
#   HEALTH_TIMEOUT     curl --max-time per attempt seconds (default: 5)
#   HEALTH_EXPECT      Expected HTTP status (default: 200)
#
# Usage:
#   ./scripts/health-check.sh
#   HEALTH_CHECK_URL=http://127.0.0.1:3000/api/v1/health ./scripts/health-check.sh
#   ./scripts/health-check.sh --url http://127.0.0.1:3000/api/v1/health
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Colours / logging (idempotent: disabled when stdout is not a TTY)
# ---------------------------------------------------------------------------
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

# ---------------------------------------------------------------------------
# Defaults — overridable via env or CLI
# ---------------------------------------------------------------------------
# PORT from .env is preferred when present so local/beta VMs stay consistent.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEFAULT_PORT=3000

if [[ -f "${APP_ROOT}/.env" ]]; then
  # shellcheck disable=SC1091
  # Extract PORT without sourcing the whole .env (avoids executing unexpected values).
  _port_line="$(grep -E '^[[:space:]]*PORT=' "${APP_ROOT}/.env" | tail -n1 || true)"
  if [[ -n "${_port_line}" ]]; then
    DEFAULT_PORT="${_port_line#*=}"
    DEFAULT_PORT="${DEFAULT_PORT//\"/}"
    DEFAULT_PORT="${DEFAULT_PORT//\'/}"
    DEFAULT_PORT="$(echo "${DEFAULT_PORT}" | tr -d '[:space:]')"
  fi
fi

HEALTH_CHECK_URL="${HEALTH_CHECK_URL:-http://127.0.0.1:${DEFAULT_PORT}/api/v1/health}"
HEALTH_RETRIES="${HEALTH_RETRIES:-30}"
HEALTH_INTERVAL="${HEALTH_INTERVAL:-2}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-5}"
HEALTH_EXPECT="${HEALTH_EXPECT:-200}"

# ---------------------------------------------------------------------------
# CLI parsing
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --url)
      HEALTH_CHECK_URL="${2:?--url requires a value}"
      shift 2
      ;;
    --retries)
      HEALTH_RETRIES="${2:?--retries requires a value}"
      shift 2
      ;;
    --interval)
      HEALTH_INTERVAL="${2:?--interval requires a value}"
      shift 2
      ;;
    --timeout)
      HEALTH_TIMEOUT="${2:?--timeout requires a value}"
      shift 2
      ;;
    --expect)
      HEALTH_EXPECT="${2:?--expect requires a value}"
      shift 2
      ;;
    -h|--help)
      sed -n '2,35p' "$0"
      exit 0
      ;;
    *)
      log_error "Unknown argument: $1"
      exit 1
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Preconditions
# ---------------------------------------------------------------------------
# curl talks HTTP without starting a browser; -f would hide status codes we need.
if ! command -v curl >/dev/null 2>&1; then
  log_error "curl is required but not installed"
  exit 1
fi

log_step "Health check → ${HEALTH_CHECK_URL}"
log_info "Expect HTTP ${HEALTH_EXPECT}; retries=${HEALTH_RETRIES}; interval=${HEALTH_INTERVAL}s; timeout=${HEALTH_TIMEOUT}s"

# ---------------------------------------------------------------------------
# Probe loop
# ---------------------------------------------------------------------------
attempt=1
while (( attempt <= HEALTH_RETRIES )); do
  # -sS: silent body but show curl errors
  # -o /dev/null: discard body (liveness only cares about status)
  # -w '%{http_code}': print status code to stdout
  # --max-time: fail fast if Nest is hung mid-boot
  # --connect-timeout: fail fast if nothing listens yet
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
