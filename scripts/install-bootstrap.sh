#!/usr/bin/env bash
set -euo pipefail

MASTER_RAW="https://raw.githubusercontent.com/LCHEROURI/universal-vibe-coding-bootstrap/main"

if [ ! -d ".git" ]; then
  echo "ERROR: Run this from the root of the target Git repository."
  exit 1
fi

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

mkdir -p scripts skills/progressive-distillation .github/workflows

install_if_absent() {
  local path="$1"
  local url="$2"
  if [ -f "$path" ]; then
    echo "$path already exists. It was NOT overwritten."
  else
    curl -fsSL "$url" -o "$path"
    echo "Installed $path"
  fi
}

install_if_absent "AGENTS.md" "$MASTER_RAW/AGENTS.md"
install_if_absent "WORKFLOW.md" "$MASTER_RAW/WORKFLOW.md"
install_if_absent "scripts/verify-bootstrap.sh" "$MASTER_RAW/scripts/verify-bootstrap.sh"
install_if_absent \
  ".github/workflows/bootstrap-check.yml" \
  "$MASTER_RAW/.github/workflows/bootstrap-check.yml"
install_if_absent \
  "skills/progressive-distillation/SKILL.md" \
  "$MASTER_RAW/skills/progressive-distillation/SKILL.md"

chmod +x scripts/verify-bootstrap.sh

echo
echo "Bootstrap verification (repository root: $ROOT):"
[ -f AGENTS.md ] && echo "✓ AGENTS.md present"
[ -f WORKFLOW.md ] && echo "✓ WORKFLOW.md present"
[ -f scripts/verify-bootstrap.sh ] && echo "✓ scripts/verify-bootstrap.sh present"
[ -f .github/workflows/bootstrap-check.yml ] && echo "✓ .github/workflows/bootstrap-check.yml present"
[ -f skills/progressive-distillation/SKILL.md ] && \
  echo "✓ skills/progressive-distillation/SKILL.md present"

echo
echo "Existing policy files were preserved. Review the files, then use your normal branch/PR workflow."
