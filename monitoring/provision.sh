#!/usr/bin/env bash
# Provision the /__boot liveness monitor.
#
# Idempotent: safe to re-run. Prints what exists rather than assuming, and exits
# non-zero on a real failure so a half-configured monitor is never mistaken for
# a working one.
#
# Every command below is the exact form that worked on this machine, after the
# documented/expected forms were rejected. Those rejections are the reason this
# script exists instead of a doc listing "gcloud monitoring uptime create ...":
#
#   * gcloud has no --config for `monitoring uptime create`; it is
#     `--configuration` and even that is rejected on this version, so the check
#     must be built from flags.
#   * `gcloud monitoring uptime create --period` is in MINUTES and only accepts
#     1, 5, 10, 15. There is no hourly option. The REST v3 API, which would
#     accept "3600s", rejects uptime-check creation on this project with
#     "Invalid target type" at every period.
#   * --regions needs at least three locations, and its values are lowercase
#     with hyphens (usa-iowa), not the REST enum names (USA_IOWA).
#   * --resource-type is uptime-url here, while the REST field is uptime_url.
#   * --request-method is lowercase 'post'.
#   * --validate-ssl needs an explicit =true.
#   * --group-type only accepts aws-elb-load-balancer and gce-instance, so a
#     URL check must name the monitored resource instead.
#   * Alert policies: `conditionThreshold.filter` is one newline-joined string
#     in REST v3, not a list, and there is no top-level `alertPolicy` block.
#   * The policy cannot be created until the check has produced at least one
#     data point. The API answers NOT_FOUND with "it could take up to 10
#     minutes to become available" — that is a wait, not a failure.
set -euo pipefail

PROJECT="${FIRESTORE_PROJECT_ID:-gym-progress-ai-lcherouri}"
HOST="gym-progress-ai-lcherouri.web.app"
CHECK_ID="boot-intake-liveness-NLXrhTcawlA"
CHANNEL_ID="6702693093728203083"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "project: $PROJECT"

# ---------------------------------------------------------------- channel ----
existing_channel=$(curl -s -m 60 -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  "https://monitoring.googleapis.com/v3/projects/$PROJECT/notificationChannels" \
  | python3 -c "import json,sys; print(' '.join(c['name'].split('/')[-1] for c in json.load(sys.stdin).get('notificationChannels',[])))" || true)

if echo "$existing_channel" | grep -q "$CHANNEL_ID"; then
  echo "notification channel $CHANNEL_ID: present"
else
  echo "notification channel $CHANNEL_ID: MISSING — create it, then verify the email"
  echo "  gcloud alpha monitoring channels create \\"
  echo "    --project=$PROJECT --display-name='Boot intake liveness' \\"
  echo "    --type=email --channel-labels=email_address=you@example.com"
  echo "  NOTE: the label key is email_address, not address."
  echo "  NOTE: the channel stays UNVERIFIED until you click the link GCP emails."
  echo "        An unverified channel sends nothing. The alert will look armed and be silent."
fi

# ------------------------------------------------------------ uptime check ----
if gcloud monitoring uptime describe "$CHECK_ID" --project="$PROJECT" >/dev/null 2>&1; then
  echo "uptime check $CHECK_ID: present"
else
  echo "uptime check $CHECK_ID: MISSING — creating"
  gcloud monitoring uptime create boot-intake-liveness \
    --project="$PROJECT" \
    --resource-type=uptime-url --resource-labels="host=$HOST" \
    --path=/__boot --port=443 --protocol=https --request-method=post \
    --body='{"buildId":"liveness-probe","stage":"boot","message":"Cloud Monitoring liveness probe"}' \
    --content-type=user-provided --custom-content-type=text/plain \
    --status-codes=202 --matcher-content='"ok":true' --matcher-type=contains-string \
    --period=15 --timeout=20 --regions=usa-iowa,usa-oregon,usa-virginia \
    --validate-ssl=true --user-labels=purpose=boot-intake-liveness
fi

# ------------------------------------------------------------- alert policy ----
if curl -s -m 60 -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  "https://monitoring.googleapis.com/v3/projects/$PROJECT/alertPolicies" \
  | grep -q "boot-intake-liveness"; then
  echo "alert policy: present"
else
  echo "alert policy: MISSING"
  echo
  echo "  The check probes correctly (bootFailures accumulates liveness-probe"
  echo "  documents on schedule) but the check_passed metric never materialises,"
  echo "  and a policy cannot filter on a metric with no data points."
  echo
  echo "  Most likely cause: the Monitoring service agent is missing, so the"
  echo "  checker can make HTTP requests but cannot write its metric."
  echo
  echo "  Check:"
  echo "    gcloud iam service-accounts list --project=$PROJECT | grep gcp-sa"
  echo "  Create it if absent (this hung in the session that wrote this file):"
  echo "    gcloud beta services identity create \\"
  echo "      --service=monitoring.googleapis.com --project=$PROJECT"
  echo
  echo "  Then wait one check period (15 min) and re-run this script."
  echo "  Policy definition: $HERE/boot-intake-alert-policy.yaml"
  echo
  echo "  Until this completes NOTHING WILL EMAIL YOU. A running probe is not"
  echo "  a monitor."
fi

echo
echo "Verify by hand:"
echo "  curl -s -o /dev/null -w '%{http_code}\n' -X POST https://$HOST/__boot \\"
echo "    -H 'Content-Type: text/plain' \\"
echo "    --data '{\"buildId\":\"manual-probe\",\"stage\":\"boot\",\"message\":\"manual\"}'"
