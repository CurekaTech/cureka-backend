#!/usr/bin/env bash
# =============================================================================
# setup-gcp-readonly.sh
# -----------------------------------------------------------------------------
# Creates the read-only service account used by the MCP analysis agent and
# grants it viewer-only roles. Prints the commands by default; pass --apply to
# run them (needs a project owner / IAM admin).
#
#   ./scripts/mcp/setup-gcp-readonly.sh --user you@cureka.com            # dry run
#   ./scripts/mcp/setup-gcp-readonly.sh --user you@cureka.com --apply
#   ./scripts/mcp/setup-gcp-readonly.sh --user a@x --user b@x --bucket <gcs-bucket> --bigquery --apply
#
# The SA gets NO write role. Analysts never download a key: they impersonate
# the SA (roles/iam.serviceAccountTokenCreator on the SA only).
# =============================================================================

set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-cureka-501005}"
SA_NAME="mcp-readonly"
APPLY=false
USERS=()
BUCKETS=()
WITH_BIGQUERY=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply) APPLY=true ;;
    --project) PROJECT_ID="$2"; shift ;;
    --user) USERS+=("$2"); shift ;;
    --bucket) BUCKETS+=("$2"); shift ;;
    --bigquery) WITH_BIGQUERY=true ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
  shift
done

SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

run() {
  echo "+ $*"
  if [[ "${APPLY}" == true ]]; then
    "$@"
  fi
}

PROJECT_ROLES=(
  roles/logging.viewer                 # Cloud Logging (pino JSON from PM2 via Ops Agent)
  roles/monitoring.viewer              # VM / Cloud SQL / uptime metrics and alerts
  roles/cloudtrace.user                # Cloud Trace (read)
  roles/errorreporting.viewer          # Error Reporting groups
  roles/compute.viewer                 # VM inventory, disks, firewall rules (no SSH)
  roles/cloudsql.viewer                # Cloud SQL instance config, flags, operations
  roles/cloudsql.client                # connect through the Cloud SQL connector
  roles/cloudasset.viewer              # resource inventory search
  roles/serviceusage.serviceUsageConsumer
)

if [[ "${WITH_BIGQUERY}" == true ]]; then
  PROJECT_ROLES+=(roles/bigquery.dataViewer roles/bigquery.jobUser)
fi

APIS=(
  analyticsdata.googleapis.com
  analyticsadmin.googleapis.com
  searchconsole.googleapis.com
  sqladmin.googleapis.com
  logging.googleapis.com
  monitoring.googleapis.com
  cloudtrace.googleapis.com
  clouderrorreporting.googleapis.com
  cloudasset.googleapis.com
  iamcredentials.googleapis.com
)

echo "Project: ${PROJECT_ID}"
echo "Service account: ${SA_EMAIL}"
[[ "${APPLY}" == true ]] || echo "(dry run — pass --apply to execute)"
echo

run gcloud services enable "${APIS[@]}" --project="${PROJECT_ID}"

if [[ "${APPLY}" == true ]] && gcloud iam service-accounts describe "${SA_EMAIL}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  echo "Service account already exists."
else
  run gcloud iam service-accounts create "${SA_NAME}" \
    --project="${PROJECT_ID}" \
    --display-name="MCP analysis agent (read-only)"
fi

for role in "${PROJECT_ROLES[@]}"; do
  run gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${SA_EMAIL}" --role="${role}" --condition=None --quiet
done

for bucket in "${BUCKETS[@]}"; do
  run gcloud storage buckets add-iam-policy-binding "gs://${bucket}" \
    --member="serviceAccount:${SA_EMAIL}" --role=roles/storage.objectViewer
done

for user in "${USERS[@]}"; do
  run gcloud iam service-accounts add-iam-policy-binding "${SA_EMAIL}" \
    --project="${PROJECT_ID}" \
    --member="user:${user}" --role=roles/iam.serviceAccountTokenCreator
done

cat <<EOF

Next (manual, outside GCP IAM):
  1. GA4: Admin → Property access management → add ${SA_EMAIL} as Viewer.
  2. Search Console: Settings → Users and permissions → add ${SA_EMAIL} (Restricted).
  3. Cloud SQL: run docs/mcp/sql/mcp_readonly_role.sql as an admin.
  4. Each analyst:
       gcloud auth application-default login \\
         --impersonate-service-account=${SA_EMAIL} \\
         --scopes=https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/analytics.readonly,https://www.googleapis.com/auth/webmasters.readonly
       ./scripts/mcp/doctor.sh
EOF
