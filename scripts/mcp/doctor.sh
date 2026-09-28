#!/usr/bin/env bash
# =============================================================================
# doctor.sh — checks an analyst machine is ready for the MCP servers in .mcp.json
# -----------------------------------------------------------------------------
#   ./scripts/mcp/doctor.sh            # loads .env.mcp from the repo root if present
#
# Read-only apart from one Redis SET probe (5 s TTL) that must be REJECTED;
# if it succeeds, the Redis user is not read-only and the check fails.
# =============================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

if [[ -f "${APP_ROOT}/.env.mcp" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${APP_ROOT}/.env.mcp"
  set +a
fi

PROJECT_ID="${GCP_PROJECT_ID:-cureka-501005}"
FAILS=0

ok()   { echo "  [ok]   $*"; }
warn() { echo "  [warn] $*"; }
fail() { echo "  [fail] $*"; FAILS=$((FAILS + 1)); }

have() { command -v "$1" >/dev/null 2>&1; }

echo "== Tooling"
for bin in node npx gcloud; do
  if have "$bin"; then ok "$bin"; else fail "$bin not found"; fi
done
if have pipx; then ok "pipx (google-analytics)"; else fail "pipx not found (google-analytics server)"; fi
if have uvx; then ok "uvx (redis)"; else warn "uvx not found (redis server disabled)"; fi

echo "== GCP identity"
if [[ -z "${MCP_GCP_SERVICE_ACCOUNT:-}" ]]; then
  fail "MCP_GCP_SERVICE_ACCOUNT is empty — gcloud-mcp would run as your own (possibly admin) account"
elif have gcloud; then
  if gcloud auth print-access-token --impersonate-service-account="${MCP_GCP_SERVICE_ACCOUNT}" >/dev/null 2>&1; then
    ok "can impersonate ${MCP_GCP_SERVICE_ACCOUNT}"
  else
    fail "cannot impersonate ${MCP_GCP_SERVICE_ACCOUNT} (need roles/iam.serviceAccountTokenCreator)"
  fi
fi

ADC_FILE="${CLOUDSDK_CONFIG:-$HOME/.config/gcloud}/application_default_credentials.json"
if [[ -n "${MCP_GOOGLE_CREDENTIALS:-}" ]]; then
  [[ -f "${MCP_GOOGLE_CREDENTIALS}" ]] && ok "MCP_GOOGLE_CREDENTIALS file exists" || fail "MCP_GOOGLE_CREDENTIALS points to a missing file"
elif [[ -f "${ADC_FILE}" ]]; then
  if grep -q '"impersonated_service_account"' "${ADC_FILE}"; then
    ok "ADC impersonates a service account"
  else
    warn "ADC is your user credential — run the impersonated login from docs/mcp/SETUP.md"
  fi
else
  fail "no Application Default Credentials (GA4, observability, Cloud SQL need them)"
fi

if have gcloud && [[ -n "${MCP_GCP_SERVICE_ACCOUNT:-}" ]]; then
  export CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT="${MCP_GCP_SERVICE_ACCOUNT}"
  if gcloud logging read 'severity>=ERROR' --project="${PROJECT_ID}" --limit=1 --freshness=1d >/dev/null 2>&1; then
    ok "Cloud Logging readable"
  else
    fail "Cloud Logging not readable as the SA"
  fi
  if [[ -n "${MCP_CLOUDSQL_INSTANCE:-}" ]]; then
    if gcloud sql instances describe "${MCP_CLOUDSQL_INSTANCE}" --project="${PROJECT_ID}" --format='value(state)' >/dev/null 2>&1; then
      ok "Cloud SQL instance ${MCP_CLOUDSQL_INSTANCE} visible"
    else
      fail "Cloud SQL instance ${MCP_CLOUDSQL_INSTANCE} not visible to the SA"
    fi
  fi
  unset CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT
fi

echo "== Cloud SQL (read-only role)"
for v in MCP_CLOUDSQL_INSTANCE MCP_CLOUDSQL_DATABASE MCP_CLOUDSQL_PASSWORD; do
  [[ -n "${!v:-}" ]] && ok "$v set" || fail "$v empty"
done
[[ "${MCP_CLOUDSQL_USER:-mcp_readonly}" == "mcp_readonly" ]] || warn "MCP_CLOUDSQL_USER is not mcp_readonly — make sure it is read-only"

echo "== Redis (read-only ACL user)"
if [[ -z "${MCP_REDIS_URL:-}" ]]; then
  warn "MCP_REDIS_URL empty"
elif have redis-cli; then
  if redis-cli -u "${MCP_REDIS_URL}" PING 2>/dev/null | grep -q PONG; then
    ok "PING"
    if redis-cli -u "${MCP_REDIS_URL}" SET mcp:doctor:write-probe 1 EX 5 2>&1 | grep -qi 'NOPERM\|no permissions'; then
      ok "writes are denied"
    else
      fail "Redis user can WRITE — use the read-only ACL from docs/mcp/SETUP.md"
    fi
  else
    fail "cannot reach Redis (is the IAP tunnel up?)"
  fi
else
  warn "redis-cli not installed; skipped"
fi

echo "== Analysis context"
for v in GA4_PROPERTY_ID GSC_SITE_URL CLOUDFLARE_ZONE_ID; do
  [[ -n "${!v:-}" ]] && ok "$v set" || warn "$v empty (agent will have to discover it)"
done

echo
if [[ "${FAILS}" -gt 0 ]]; then
  echo "${FAILS} check(s) failed."
  exit 1
fi
echo "All required checks passed. Start Claude Code and run /mcp to log in to the Cloudflare servers."
