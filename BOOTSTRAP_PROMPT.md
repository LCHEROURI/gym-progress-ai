# Universal New-App Bootstrap Prompt

Paste this as the **first instruction** to any coding agent when starting work in an existing GitHub repository.

```text
Before writing or modifying application code, bootstrap and verify this repository under my universal development controls.

1. Locate and read the root AGENTS.md completely. If it is missing, stop substantive coding and report AGENTS.md NOT FOUND.
2. Run the equivalent of:
   pwd
   git rev-parse --show-toplevel
   git remote -v
   git branch --show-current
   git log -1 --oneline
   git status --short
3. Report the repository name, absolute root, remote owner/name, branch, HEAD, worktree status, task scope, plan, and risks.
4. Confirm that every file you touch is inside the verified repository root. Do not work in a sibling directory, another checkout, another worktree, or another app with a similar name.
5. Read WORKFLOW.md for substantive, ambiguous, security-sensitive, GitHub, database, external-service, or deployment tasks.
6. Locate and read any nested AGENTS.md files that apply to the files you will change.
7. Read relevant project documentation and inspect existing code before planning implementation.
8. Do not modify code until these checks and the plan are complete.
9. Do not commit, push, create a PR, merge, deploy, modify production, change secrets, or modify external infrastructure unless I explicitly authorize that exact action.
10. After implementation, run the repository's real checks, review the diff, inspect Git status, and report evidence accurately.
```

## Required bootstrap files

A correctly bootstrapped repository contains:

- `AGENTS.md`
- `WORKFLOW.md`
- `skills/progressive-distillation/SKILL.md`

If a target repository already has `AGENTS.md` or the skill, preserve its project-specific rules and merge safely. Never overwrite policy files blindly.

The root `AGENTS.md` is the controlling startup policy. `WORKFLOW.md` is its detailed companion. The Progressive Distillation skill may add stricter guidance but may not weaken either policy.
