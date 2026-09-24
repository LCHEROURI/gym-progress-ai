#!/usr/bin/env bash
set -euo pipefail

TEMPLATE="LCHEROURI/universal-vibe-coding-bootstrap"
OWNER="LCHEROURI"
VISIBILITY="private"
DESCRIPTION=""
FIREBASE_ENABLED="1"
FIREBASE_PROJECT_OVERRIDE=""

usage() {
  cat <<'EOF'
Usage:
  ./scripts/create-repo-from-template.sh REPOSITORY_NAME [--public|--private] [--owner OWNER] [--description TEXT] [--firebase-project ID] [--no-firebase]

Examples:
  ./scripts/create-repo-from-template.sh restaurant-voice-manager
  ./scripts/create-repo-from-template.sh my-public-app --public
  ./scripts/create-repo-from-template.sh team-app --owner LCHEROURI --description "AI-assisted application"
  ./scripts/create-repo-from-template.sh static-app --firebase-project static-app-lcherouri
EOF
}

if [ "$#" -lt 1 ] || [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
  usage
  [ "$#" -lt 1 ] && exit 2
  exit 0
fi

REPOSITORY_NAME="$1"
shift

while [ "$#" -gt 0 ]; do
  case "$1" in
    --public)
      VISIBILITY="public"
      ;;
    --private)
      VISIBILITY="private"
      ;;
    --owner)
      shift
      [ "$#" -gt 0 ] || { echo "FAIL: --owner needs a value" >&2; exit 2; }
      OWNER="$1"
      ;;
    --description)
      shift
      [ "$#" -gt 0 ] || { echo "FAIL: --description needs a value" >&2; exit 2; }
      DESCRIPTION="$1"
      ;;
    --firebase-project)
      shift
      [ "$#" -gt 0 ] || { echo "FAIL: --firebase-project needs a value" >&2; exit 2; }
      FIREBASE_PROJECT_OVERRIDE="$1"
      ;;
    --no-firebase)
      FIREBASE_ENABLED="0"
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "FAIL: unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

case "$REPOSITORY_NAME" in
  ""|*[!A-Za-z0-9._-]*)
    echo "FAIL: repository name contains unsupported characters: $REPOSITORY_NAME" >&2
    exit 2
    ;;
esac

command -v gh >/dev/null 2>&1 || {
  echo "FAIL: GitHub CLI 'gh' is required. Install it from https://cli.github.com/" >&2
  exit 1
}
if [ "$FIREBASE_ENABLED" = "1" ]; then
  command -v gcloud >/dev/null 2>&1 || {
    echo "FAIL: gcloud is required for automatic Firebase setup. Use --no-firebase to skip it." >&2
    exit 1
  }
fi
gh auth status >/dev/null 2>&1 || {
  echo "FAIL: GitHub CLI is not authenticated. Run: gh auth login" >&2
  exit 1
}

FULL_NAME="$OWNER/$REPOSITORY_NAME"
if gh repo view "$FULL_NAME" >/dev/null 2>&1; then
  echo "FAIL: repository already exists: $FULL_NAME" >&2
  exit 1
fi

args=(repo create "$FULL_NAME" "--template" "$TEMPLATE" "--$VISIBILITY")
[ -n "$DESCRIPTION" ] && args+=(--description "$DESCRIPTION")
echo "Creating $FULL_NAME from $TEMPLATE..."
gh "${args[@]}"

required=(
  "AGENTS.md"
  "WORKFLOW.md"
  "BOOTSTRAP_PROMPT.md"
  "scripts/install-bootstrap.sh"
  "scripts/configure-firebase-app.sh"
  "scripts/verify-bootstrap.sh"
  "skills/progressive-distillation/SKILL.md"
)
# GitHub creates the repository immediately, but its Contents API can lag while
# the template commit is materialized. Retry boundedly instead of reporting a
# successful creation as failed during that short propagation window.
max_attempts=12
for attempt in $(seq 1 "$max_attempts"); do
  missing=()
  for path in "${required[@]}"; do
    if ! gh api "repos/$FULL_NAME/contents/$path" >/dev/null 2>&1; then
      missing+=("$path")
    fi
  done
  if [ "${#missing[@]}" -eq 0 ]; then
    if [ "$FIREBASE_ENABLED" = "1" ]; then
      project_id="$FIREBASE_PROJECT_OVERRIDE"
      if [ -z "$project_id" ]; then
        slug="$(printf '%s' "$REPOSITORY_NAME" | tr '[:upper:]_' '[:lower:]-' | tr -cd 'a-z0-9-' | sed 's/--*/-/g; s/^-//; s/-$//')"
        digest="$(printf '%s' "$OWNER/$REPOSITORY_NAME" | shasum -a 1 | cut -c1-6)"
        project_id="${slug:0:23}-$digest"
      fi
      bash "$(dirname "$0")/configure-firebase-app.sh" "$OWNER" "$REPOSITORY_NAME" "$project_id"
    else
      echo "Firebase setup skipped by --no-firebase."
    fi
    echo "PASS: $FULL_NAME was created from the universal template and verified."
    echo "Next: open $FULL_NAME in the coding environment and paste BOOTSTRAP_PROMPT.md."
    exit 0
  fi
  if [ "$attempt" -lt "$max_attempts" ]; then
    echo "Waiting for template files (attempt $attempt/$max_attempts): ${missing[*]}"
    sleep 2
  fi
done

echo "FAIL: template verification failed after $max_attempts attempts; missing: ${missing[*]}" >&2
exit 1
