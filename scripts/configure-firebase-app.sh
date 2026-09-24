#!/usr/bin/env bash
set -euo pipefail

OWNER="${1:?GitHub owner is required}"
REPOSITORY_NAME="${2:?Repository name is required}"
FIREBASE_PROJECT="${3:?Firebase project ID is required}"
FIREBASE_TARGET="${4:-}"
BOOTSTRAP_REPOSITORY="LCHEROURI/universal-vibe-coding-bootstrap"
WIF_PROJECT="portfolio-app-freebuff2"
WIF_PROJECT_NUMBER="952213217375"
WIF_POOL="github-actions"
WIF_PROVIDER="github"

command -v gh >/dev/null 2>&1 || { echo "FAIL: gh is required for Firebase setup" >&2; exit 1; }
command -v gcloud >/dev/null 2>&1 || { echo "FAIL: gcloud is required for Firebase setup" >&2; exit 1; }

if ! npx -y firebase-tools@latest projects:list --json >/dev/null 2>&1; then
  echo "FAIL: Firebase CLI authentication is required" >&2
  exit 1
fi

default_project_number="$(gcloud projects describe "$FIREBASE_PROJECT" --format='value(projectNumber)' 2>/dev/null || true)"
if [ -z "$default_project_number" ]; then
  echo "Creating Firebase project $FIREBASE_PROJECT..."
  npx -y firebase-tools@latest projects:create "$FIREBASE_PROJECT" --display-name "$REPOSITORY_NAME" --json >/dev/null
fi

if ! gcloud iam workload-identity-pools describe "$WIF_POOL" --project="$WIF_PROJECT" --location=global >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create "$WIF_POOL" --project="$WIF_PROJECT" --location=global \
    --display-name='GitHub Actions' --description='OIDC identities for approved GitHub repositories' --quiet
fi
if ! gcloud iam workload-identity-pools providers describe "$WIF_PROVIDER" --project="$WIF_PROJECT" --location=global --workload-identity-pool="$WIF_POOL" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers create-oidc "$WIF_PROVIDER" \
    --project="$WIF_PROJECT" --location=global --workload-identity-pool="$WIF_POOL" \
    --display-name='GitHub Actions OIDC' \
    --issuer-uri='https://token.actions.githubusercontent.com' \
    --attribute-mapping='google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner,attribute.ref=assertion.ref,attribute.event_name=assertion.event_name' \
    --attribute-condition="assertion.repository_owner == '$OWNER'" --quiet
fi

service_account="github-hosting@${FIREBASE_PROJECT}.iam.gserviceaccount.com"
if ! gcloud iam service-accounts describe "$service_account" --project="$FIREBASE_PROJECT" >/dev/null 2>&1; then
  gcloud iam service-accounts create github-hosting --project="$FIREBASE_PROJECT" \
    --display-name='GitHub Firebase Hosting deployer' --quiet >/dev/null
fi
for attempt in $(seq 1 12); do
  gcloud iam service-accounts describe "$service_account" --project="$FIREBASE_PROJECT" >/dev/null 2>&1 && break
  [ "$attempt" -eq 12 ] && { echo "FAIL: service account propagation timed out" >&2; exit 1; }
  sleep 5
done
gcloud projects add-iam-policy-binding "$FIREBASE_PROJECT" \
  --member="serviceAccount:$service_account" --role='roles/firebasehosting.admin' \
  --condition=None --quiet >/dev/null
gcloud iam service-accounts add-iam-policy-binding "$service_account" \
  --project="$FIREBASE_PROJECT" --role='roles/iam.workloadIdentityUser' \
  --member="principalSet://iam.googleapis.com/projects/$WIF_PROJECT_NUMBER/locations/global/workloadIdentityPools/$WIF_POOL/attribute.repository/$OWNER/$REPOSITORY_NAME" \
  --condition=None --quiet >/dev/null

write_remote_file() {
  local path="$1" content="$2" message="$3" encoded sha
  encoded="$(printf '%s' "$content" | base64 | tr -d '\n')"
  sha="$(gh api "repos/$OWNER/$REPOSITORY_NAME/contents/$path" --jq .sha 2>/dev/null || true)"
  if [ -n "$sha" ]; then
    gh api --method PUT "repos/$OWNER/$REPOSITORY_NAME/contents/$path" \
      -f message="$message" -f content="$encoded" -f branch=main -f sha="$sha" >/dev/null
  else
    gh api --method PUT "repos/$OWNER/$REPOSITORY_NAME/contents/$path" \
      -f message="$message" -f content="$encoded" -f branch=main >/dev/null
  fi
}

if [ -n "$FIREBASE_TARGET" ]; then
  firebase_json=$(cat <<EOF
{
  "hosting": [{
    "target": "$FIREBASE_TARGET",
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }]
  }]
}
EOF
)
else
  firebase_json=$(cat <<'EOF'
{
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }]
  }
}
EOF
)
fi
if [ -n "$FIREBASE_TARGET" ]; then
  firebaserc=$(cat <<EOF
{
  "projects": {
    "default": "$FIREBASE_PROJECT"
  },
  "targets": {
    "$FIREBASE_PROJECT": {
      "hosting": {
        "$FIREBASE_TARGET": ["$FIREBASE_PROJECT"]
      }
    }
  }
}
EOF
)
else
  firebaserc=$(printf '{\n  "projects": {\n    "default": "%s"\n  }\n}\n' "$FIREBASE_PROJECT")
fi
workflow=$(cat <<EOF
name: Firebase Hosting

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

permissions:
  contents: read
  checks: write
  id-token: write
  pull-requests: write

jobs:
  deploy:
    uses: $BOOTSTRAP_REPOSITORY/.github/workflows/firebase-hosting-reusable.yml@main
    with:
      firebase-project: $FIREBASE_PROJECT
      firebase-service-account: $service_account
      firebase-target: $FIREBASE_TARGET
      workload-identity-provider: projects/$WIF_PROJECT_NUMBER/locations/global/workloadIdentityPools/$WIF_POOL/providers/$WIF_PROVIDER
EOF
)

write_remote_file "firebase.json" "$firebase_json" "chore: configure Firebase Hosting"
write_remote_file ".firebaserc" "$firebaserc" "chore: bind Firebase project"
write_remote_file ".github/workflows/firebase-hosting.yml" "$workflow" "ci: add centralized Firebase deployment"

registry_content="$(gh api "repos/$BOOTSTRAP_REPOSITORY/contents/apps.yml" --jq .content | base64 --decode)"
if ! printf '%s\n' "$registry_content" | grep -Fq "repo: $OWNER/$REPOSITORY_NAME"; then
  registry_target="null"
  [ -n "$FIREBASE_TARGET" ] && registry_target="$FIREBASE_TARGET"
  registry_content+=$(cat <<EOF

  - repo: $OWNER/$REPOSITORY_NAME
    status: active
    platform: firebase-hosting
    firebase_project: $FIREBASE_PROJECT
    firebase_target: $registry_target
    production_url: https://$FIREBASE_PROJECT.web.app
    preview_url_pattern: https://$FIREBASE_PROJECT--pr-{number}-*.web.app
EOF
)
  registry_encoded="$(printf '%s' "$registry_content" | base64 | tr -d '\n')"
  registry_sha="$(gh api "repos/$BOOTSTRAP_REPOSITORY/contents/apps.yml" --jq .sha)"
  gh api --method PUT "repos/$BOOTSTRAP_REPOSITORY/contents/apps.yml" \
    -f message="chore: register $OWNER/$REPOSITORY_NAME" \
    -f content="$registry_encoded" -f branch=main -f sha="$registry_sha" >/dev/null
fi

echo "PASS: Firebase project $FIREBASE_PROJECT and OIDC deployment configured for $OWNER/$REPOSITORY_NAME"
