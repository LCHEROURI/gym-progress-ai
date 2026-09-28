# Universal Vibe Coding AGENTS.md

## Purpose

This file is the short, always-read constitution for AI coding agents working in this repository. It is designed to prevent repository mix-ups, accidental cross-project edits, and unauthorized delivery or production actions.

The detailed operating procedure is in [`WORKFLOW.md`](WORKFLOW.md). Read it when a task is substantive, ambiguous, security-sensitive, or involves GitHub, databases, external services, or deployment.

## Mandatory startup sequence

Before writing, modifying, deleting, moving, renaming, or generating application code, the agent must:

1. Confirm the repository name and the absolute repository root.
2. Confirm the configured Git remote and its owner/name.
3. Confirm the active branch and current commit.
4. Inspect the working-tree status.
5. Read this file completely.
6. Locate and read every nested `AGENTS.md` that applies to the files being changed.
7. Read relevant project documentation and inspect the existing implementation.
8. State the task, expected scope, plan, verification, and risks.
9. Only then begin substantive implementation.

The startup identity report must include:

```text
REPOSITORY:
REPOSITORY ROOT:
REMOTE:
BRANCH:
HEAD:
WORKTREE STATUS:
REQUESTED TASK:
EXPECTED SCOPE:
RISKS:
```

If the repository identity, root, remote, branch, or task scope is uncertain: **STOP and report the uncertainty.**

## Repository lock — the most important rule

The current repository root is the only permitted project scope.

- Use the absolute root returned by `git rev-parse --show-toplevel` as the boundary.
- Resolve all file paths against that root.
- Never infer a project from a similarly named directory, an old conversation, a preview URL, or another worktree.
- Never silently switch directories, repositories, branches, worktrees, or cloud projects.
- Never modify another repository, sibling directory, parent checkout, nested checkout, or external worktree unless the user explicitly identifies and authorizes it as a separate task.
- Before every consequential GitHub, Firebase, cloud, database, or deployment action, re-check the repository root, remote owner/name, branch, and target environment.
- If a command would operate outside the current root, stop and ask or report it rather than broadening scope.

A preview server, Firebase project, Convex deployment, cloud account, or GitHub repository is not proof of repository identity. Verify the local Git remote and source revision separately.

## Existing work protection

Before editing:

- Preserve unrelated working-tree changes.
- Do not reset, clean, stash, overwrite, or stage changes you did not make.
- If ownership of a change is unclear, stop and report it.
- Inspect the full relevant diff before committing.

## Change safety

- Prefer the smallest safe change over a broad rewrite.
- Preserve working behavior outside the requested scope.
- Follow the repository's existing architecture, dependencies, design system, data patterns, and documentation.
- Do not invent missing schemas, APIs, credentials, infrastructure, or deployment details.
- Do not add, remove, or upgrade dependencies unless necessary and justified.
- Do not perform unrelated cleanup, formatting sweeps, migrations, redesigns, or refactors.
- Do not disable tests, validation, security checks, or protections to make a change pass.

## Security and data protection

Never expose, print, copy, or commit passwords, API keys, tokens, private keys, service-account credentials, production secrets, or unredacted personal data. Treat `.env*` files as sensitive; use placeholders in `.env.example` only.

Never weaken authentication, authorization, tenancy rules, database rules, App Check, rate limits, validation, or production safeguards. Do not delete, export, migrate, overwrite, or disclose user or production data without explicit authorization and appropriate safeguards.

Database schemas, migrations, indexes, security rules, storage rules, billing, payments, credentials, and external APIs are protected operations. Writing configuration or migration code does not authorize executing it.

## Testing and honesty

Before declaring work complete, run the relevant commands defined by the repository: focused tests, typecheck, lint, build, integration/emulator checks, and end-to-end checks when applicable. Never claim a command passed unless it was actually run successfully. Report pre-existing failures separately from failures caused by the current change. Never weaken or delete a test merely to obtain a green result.

## Progressive Distillation

For meaningful failures, regressions, architectural decisions, security discoveries, major review findings, or reusable patterns, consult:

`skills/progressive-distillation/SKILL.md`

Distilled principles may add stricter guidance, but they must never weaken this file, `WORKFLOW.md`, or project-specific safety rules.

## Action-specific authorization gates

Authorization for one delivery action does not authorize the next. Unless the user explicitly authorizes the exact action, stop before it:

```text
inspect → plan → implement → test → review → report → STOP

commit → STOP
push → STOP
create PR → STOP
merge → STOP
deploy / production change → STOP
```

In particular:

- Coding does not authorize committing.
- Committing does not authorize pushing.
- Pushing does not authorize creating a PR.
- A PR or passing CI does not authorize merging.
- Merging does not authorize deploying.
- Permission to deploy one environment does not authorize another environment.
- Reading or inspecting an external service does not authorize modifying it.

Destructive Git commands (`reset --hard`, `clean -fd*`, force-push, branch deletion, history rewrite) require explicit authorization. Never deploy, run destructive migrations, delete production data, change secrets, alter billing, or weaken repository settings without explicit authorization.

## Documentation and nested rules

Consult relevant `README.md`, architecture, data model, security, testing, decision, plan, and status documents before architectural changes. Update documentation when behavior materially changes.

Nested `AGENTS.md` files refine these rules for their directory. Read the root file first, then the nearest applicable nested file. A nested file may be stricter, but it may not silently weaken repository containment, security, testing honesty, or action-specific authorization.

## Completion report

Before declaring completion, review the relevant diff, check for secrets and unrelated files, verify repository scope, run the required checks, and inspect Git status. Report:

- **Completed** — what changed.
- **Files changed** — exact paths.
- **Verification** — commands actually run and results.
- **Git state** — branch, commit status, and push/PR/merge state.
- **Not performed** — commit, push, PR, merge, deployment, production, or external changes not performed.
- **Remaining issues** — warnings, failures, or follow-up work.

When uncertain between a destructive and non-destructive action, choose the non-destructive action. When uncertain about repository identity or production impact, stop and preserve the current state.

## Project-specific rules

Add stack-specific and application-specific rules below this line. They may make the policy stricter, but must preserve the universal repository lock, security protections, verification honesty, and authorization gates above.

### Project identity

Gym Progress AI — a mobile-first personal gym companion. One application per this repository; nothing here belongs to any other checkout. Related-but-unrelated projects (`cook-with-freebuff`, its `webapp-starter/` folder) are separate repositories and are never touched from this one.

| Thing | Name | Location |
|---|---|---|
| This repository + directory | `gym-progress-ai` | `~/gym-progress-ai` (standalone git repo) |
| GitHub remote | `gym-progress-ai` | `LCHEROURI/gym-progress-ai` (public) |
| Firebase / Google Cloud project | `gym-progress-ai-lcherouri` | provisioned in Phase 2 (globally unique id — the plain id was taken; repo/directory keep the name `gym-progress-ai`) |
| Template this repo was created from | `universal-vibe-coding-bootstrap` | `LCHEROURI/universal-vibe-coding-bootstrap` |

### 1. Scope boundaries

- Vite + React + TypeScript PWA on the Google ecosystem only: Firebase Auth, Cloud Firestore, Firebase Hosting, Cloud Functions, Cloud Scheduler, optional Firebase Cloud Messaging, Google Gemini via server-side `@google/genai` (`GoogleGenAI`, called directly in `functions/src/index.ts`). Genkit is not a dependency; if a doc or plan says "Genkit flows", it means server-side Gemini calls.
- No Supabase, no PostgreSQL, no Vercel-specific services, no external databases unless the user explicitly approves them.
- Client code never imports server code. The reverse does happen, deliberately and in one direction: `functions/src/` imports pure logic from the client tree — `src/domain/session`, `src/progress/stats`, `src/reports/{weekly,observations}`, `src/ai/prompts/*` — plus the shared contract in `src/shared/`. Those modules must stay free of browser APIs and the Firebase Web SDK. That is not just convention: `functions/tsconfig.json` compiles them with `lib: ES2022` and no DOM, so a browser API would fail the functions build.
- No application code exists until the phase that introduces it is started. The documents in this repo are the contract between phases.

### 2. Coding standards

- TypeScript strict mode. A `any` needs a written reason beside it.
- Components use controlled inputs with `useState` or a reducer store; no form libraries.
- Validate every external boundary (function payloads, AI structured output, Firestore writes) with a Zod schema. There is no `src/shared/schemas/` directory: a contract that both sides of the boundary import lives in `src/shared/` (e.g. `boot-failure.ts`, `env.ts`), and a schema only one side needs lives next to that side's consumer (`src/domain/`, `src/data/`, `functions/src/`).
- Small, single-purpose modules; split a file the moment it holds more than one responsibility.
- Error copy is honest and actionable — never "Something went wrong".

### 3. Firebase rules

- Firestore rules are **default deny**; every path asserts `request.auth != null && request.auth.uid == uid`.
- A client-supplied `userId` is never trusted; identity comes from `request.auth` (client) or verified ID tokens (server).
- Privileged writes (AI recommendations, weekly reports, derived rollups) happen only through Cloud Functions with the Admin SDK.
- Every rules change ships with an emulator test (`@firebase/rules-unit-testing`). Rules are never deployed before that suite is green.

### 4. Testing requirements

- Per phase: build → run tests → inspect errors → fix → verify functionality → summarize. Existing code is not evidence of working.
- Vitest for units (jsdom pragma on component tests), emulator tests for rules and Functions integration. Full matrix in `docs/TEST-PLAN.md`.
- Regression bugs get a red-green test that demonstrably fails before the fix.
- `npm run check` (typecheck → lint → test → build) is the green gate before any change is called done.
- Every `className` token must have a CSS rule in `src/styles.css` (a class in markup is not evidence of styling). `npm run lint:classnames` (inside `npm run lint`) enforces this against a ratchet baseline, `scripts/classname-lint-baseline.json`: pre-existing debt is listed, new orphans fail the gate, and styling a class must shrink the baseline (`-- --update-baseline` only for intentional burn-down).

### 5. Security requirements

- API credentials live in Google Cloud Secret Manager — never client code, `.env.local`, git, or logs.
- Auth is checked before any quota- or history-bearing work. **App Check is not enforced anywhere in this codebase** — there is no App Check code, and no AI callable endpoint exists yet (Gemini runs inside the scheduled weekly-report function with a server-side key). Treat App Check as a requirement to satisfy *before* any AI callable is exposed to clients, not as a control already in place.
- Firebase Authentication with Google sign-in; no anonymous access to workout records.
- Analytics are optional and off by default; sensitive health-style notes never enter analytics events.

### 6. AI safety requirements

Full policy in `docs/AI-SAFETY.md`. In short: Gemini is advisory only; the symptom gate suppresses progression advice after concerning symptom reports; no diagnosis, no medication talk, no "push through"; prompts are version-controlled in `src/ai/prompts/` (shared: the client runs them through `firebase/ai`, the functions import the same files); every recommendation stores its facts, model, and prompt version (audit trail).

### 7. No destructive database actions without confirmation

No bulk deletes, collection drops, field truncation, or reseeding over real data without explicit human confirmation recorded in the change summary. Cleanup scripts target explicitly prefixed test data only and must prove what they delete before deleting it.

### 8. No silent schema changes

Every schema change is declared first in `docs/DATA-MODEL.md`, reviewed, and shipped with its rules/tests update in the same deploy. Additive changes only; renames and removals need a written migration plan.

### 9. Verify before claiming completion

No success claim without fresh command output in the same change summary. "Should work" is not a status. Acceptance claims map one-by-one to `PROJECT-SPEC.md` §15.

### 10. Preserve historical workout data

Completed sessions are append-only history. Past workouts, sets, PRs, and reports are never rewritten, recomputed in place, or deleted. Derived collections (`exerciseStats`) are rebuildable caches computed FROM history and never outrank the sessions themselves.

### 11. Never fabricate user workout history

Missing data renders as "no data yet" / "I don't have enough workout history yet." — never invented numbers, dates, weights, or sessions. AI context builders send only records that exist; deterministic code computes every fact before Gemini sees it.

### 12. Gemini recommendations are suggestions only

AI never writes `weightUsed`, never changes the workout plan, never marks sets complete. The user decides: USE / KEEP / CHOOSE ANOTHER. Every suggestion carries a reason grounded in the user's own numbers.

### Stack and commands

- React 19 + TypeScript + Vite; Firebase Web SDK (Auth, Firestore, optional Messaging); Zod; hand-rolled SVG charts; PWA manifest + service worker.
- Server: Firebase Cloud Functions (2nd gen) + Gemini via `@google/genai`.
- Testing: Vitest + Testing Library + jsdom; `@firebase/rules-unit-testing`.

```bash
npm install
npm run dev            # Vite dev server
npm run check          # typecheck → lint → test → build
npm run lint:classnames # className tokens must have a CSS rule (ratchet baseline)
npm run test:layout    # Playwright layout smoke: no horizontal overflow at 320/390px
npm run emulators      # Firebase Emulator Suite (leave running in its own terminal)
npm run test:emulator  # rules + recovery integration tests (needs the emulator above)
npm run deploy         # Hosting + Functions + Rules + Indexes (explicit authorization only)
```

`emulators` and `deploy` shell out to the `firebase` CLI, which is a machine-level
prerequisite (global `firebase-tools`), not a project dependency. `test:emulator`
does not start an emulator; it points Vitest at the one `emulators` is already
serving on 127.0.0.1:8080 (the port in `firebase.json`).
