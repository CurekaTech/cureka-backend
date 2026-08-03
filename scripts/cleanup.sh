#!/usr/bin/env bash
# =============================================================================
# cleanup.sh
# -----------------------------------------------------------------------------
# Keep only the last 5 successful deployment records under .deployments/history/.
# Idempotent — safe to run repeatedly.
# =============================================================================

set -euo pipefail

if [[ -t 1 ]]; then
  C_RESET='\033[0m'
  C_RED='\033[0;31m'
  C_GREEN='\033[0;32m'
  C_BLUE='\033[0;34m'
  C_CYAN='\033[0;36m'
else
  C_RESET='' C_RED='' C_GREEN='' C_BLUE='' C_CYAN=''
fi

ts() { date -u +'%Y-%m-%dT%H:%M:%SZ'; }
log_info()  { echo -e "$(ts) ${C_BLUE}[INFO]${C_RESET}  $*"; }
log_ok()    { echo -e "$(ts) ${C_GREEN}[OK]${C_RESET}    $*"; }
log_error() { echo -e "$(ts) ${C_RED}[ERROR]${C_RESET} $*" >&2; }
log_step()  { echo -e "$(ts) ${C_CYAN}[STEP]${C_RESET}  $*"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
KEEP_DEPLOYMENTS="${KEEP_DEPLOYMENTS:-5}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --keep) KEEP_DEPLOYMENTS="${2:?}"; shift 2 ;;
    --app-root) APP_ROOT="$(cd "${2:?}" && pwd)"; shift 2 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) log_error "Unknown argument: $1"; exit 1 ;;
  esac
done

if ! [[ "${KEEP_DEPLOYMENTS}" =~ ^[1-9][0-9]*$ ]]; then
  log_error "KEEP_DEPLOYMENTS must be a positive integer (got: ${KEEP_DEPLOYMENTS})"
  exit 1
fi

HISTORY_DIR="${APP_ROOT}/.deployments/history"

if [[ ! -d "${HISTORY_DIR}" ]]; then
  log_info "No deployment history at ${HISTORY_DIR} — nothing to clean"
  exit 0
fi

log_step "Cleaning deployment history (keep last ${KEEP_DEPLOYMENTS})"

mapfile -t records < <(ls -1 "${HISTORY_DIR}"/*.json 2>/dev/null | sort -r || true)
total="${#records[@]}"

if (( total <= KEEP_DEPLOYMENTS )); then
  log_ok "History has ${total} record(s) ≤ keep=${KEEP_DEPLOYMENTS}; no cleanup needed"
  exit 0
fi

to_delete=("${records[@]:${KEEP_DEPLOYMENTS}}")
deleted=0
for file in "${to_delete[@]}"; do
  rm -f "${file}"
  deleted=$((deleted + 1))
  log_info "Removed: $(basename "${file}")"
done

log_ok "Cleanup complete — deleted ${deleted}, kept ${KEEP_DEPLOYMENTS}"
exit 0
