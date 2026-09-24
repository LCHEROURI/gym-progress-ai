# Test Plan

Layered testing for Gym Progress AI. The rule from AGENTS.md rule 4 governs
everything here: build → run tests → inspect errors → fix → verify → summarize,
per phase. No phase is "done" because the code exists.

## Layers

| Layer | Tooling | Runs |
|---|---|---|
| Unit + component | Vitest, Testing Library, jsdom | `npm test` |
| Accessibility | axe-core in component tests | `npm test` |
| Security rules | `@firebase/rules-unit-testing` vs emulator | `npm run test:emulator` |
| Functions integration | Vitest vs Functions/Firestore emulators | `npm run test:emulator` |
| End-to-end smoke | manual iPhone checklist (automate later if useful) | per release |
| Green gate | typecheck → lint → test → build | `npm run check` |

Component tests carry the `// @vitest-environment jsdom` pragma; the default
environment is node.

## Required coverage (from the product brief)

| Requirement | Layer | Asserts |
|---|---|---|
| Monday / Wednesday / Friday templates | unit | exact exercises, sets, rep ranges, order, duration bands |
| Starting a workout | unit + integration | session doc `in_progress`, `startedAt`, exercises materialized with `previousWeight` |
| Saving weight | unit + integration | write-through fires; `exerciseStats.lastWeight` updates on completion |
| Saving reps | unit | per-set docs written; target ranges validated |
| Checking exercises off | unit | `completed` flips; progress counter increments |
| Refresh recovery | jsdom + manual | draft rehydrates from mirror + Firestore; nothing lost |
| Offline recovery | emulator + manual | queued writes sync; chip OFFLINE → SYNCING → SAVED |
| Previous weight lookup | unit | rollup hit; fallback query rebuilds missing rollup |
| AI recommendation generation | integration | facts computed in code; Zod-validated output; audit record written |
| AI recommendation acceptance | unit | `accepted: true`, `finalWeightChosen` recorded |
| AI recommendation rejection | unit | `accepted: false`, copy "Keeping your previous weight." |
| History retrieval | integration | chronological, correct completion counts |
| Progress calculations | unit | totals, month counts, completion rate, cardio minutes |
| PR detection | unit | only real history; false-positive cases (ties, lower weights) |
| Weekly aggregation | unit | planned/completed/missed, strength deltas, cardio |
| Weekly report generation | integration | report uses real data; saved permanently; `facts` matches code-computed stats |
| Gemini context retrieval | unit | only relevant records included; full DB never sent |
| Gemini insufficient-data response | unit | exact string "I don't have enough workout history yet." |
| Symptom safety gate | unit | blockedBySafety, exact copy, no progression output |
| Firestore Security Rules | emulator | owner-only per path; default deny; derived/AI writes rejected from client |
| Authentication | emulator | no anonymous read of workout records |
| Mobile responsiveness | jsdom viewport + manual | large tap targets, bottom nav, no overflow at 390×844 |
| Accessibility | axe | nav, cards, steppers, dialogs clean |

## Security rules suite (emulator)

1. Unauthenticated read of any `users/{uid}` path → denied.
2. User A reading/writing user B's paths → denied (sessions, sets, reports,
   recommendations, stats, settings).
3. Owner CRUD on own sessions/exercises/sets/settings → allowed.
4. Client writes to `exerciseStats`, `personalRecords`, `aiRecommendations`,
   `weeklyReports` → denied (server-derived / server-only).
5. Shape validation: out-of-enum `status`/`difficulty`/`painStatus` and
   negative/non-integer numbers → denied.

## AI integrity suite

1. Context builder returns only relevant exerciseKeys/records (snapshot test).
2. All numeric facts sent to Gemini equal deterministic outputs (property:
   no number in the prompt that code did not compute).
3. Symptom gate blocks progression before any model call (mock asserts zero
   calls).
4. Insufficient data short-circuits with the exact copy.
5. Every recommendation persists `model`, `promptVersion`, `contextFacts`.
6. No path lets the AI set `weightUsed` (type-level + repository test).

## Regression discipline

Bugs get a red-green test: write the failing test first, prove it fails, fix,
prove it passes. Refresh/offline/recovery bugs always get one.

## Preflight probes (run before blaming app code)

Hard-won lessons turned into standing checks:

1. **Auth-surface preflight** — served chunk URLs answer 200 (no stale server
   over a deleted build dir); the auth API answers with the configured key
   under the app origin AND `https://gym-progress-ai-lcherouri.firebaseapp.com/*`
   (the sign-in handler origin) AND the deployed origin. A key/referrer
   allowlist gap must fail this loudly, not as a dead button.
2. **Env-readiness** — the app and Functions report missing configuration by
   NAME at startup (`config missing: GEMINI_API_KEY`), never as a mystery 401.

## No fake data in production

Seeds and demo workouts run only under the emulators or explicit dev flags.
A test that seeds data asserts its cleanup. Production history is append-only
(AGENTS.md rule 10).

## Release gate (Phase 16–18)

`npm run check` green → emulator suite green → manual iPhone pass against
PROJECT-SPEC.md §15 acceptance criteria, item by item → security review →
deploy → post-deploy smoke (sign-in, load workout, save a set, reload
persistence). Deployment happens only on explicit instruction.
