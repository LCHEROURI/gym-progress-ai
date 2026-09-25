# Architecture

Gym Progress AI — Vite + React + TypeScript PWA on Firebase, with all Gemini
work executed server-side. Design goals: local-first (gym wifi is unreliable),
portable (Google ecosystem only, no vendor lock beyond it), and safe (private
workout history and API credentials never reach the browser).

## System diagram

```mermaid
flowchart TB
    subgraph Client["PWA client — Vite + React + TS"]
        UI["TODAY · HISTORY · PROGRESS · AI COACH · REPORTS + gear"]
        State["Screen state + workout session lifecycle"]
        UI --> State
    end
    subgraph FB["Firebase project: gym-progress-ai-lcherouri"]
        Auth["Firebase Auth — Google sign-in"]
        FS[("Firestore — persistent offline cache")]
        Rules["Security rules: default deny, own uid"]
        AC["App Check — enforced on AI callables"]
    end

    subgraph Server["Cloud Functions (2nd gen) — Genkit + Gemini"]
        SW["suggestWeight flow"]
        CA["coachAnswer flow"]
        WR["weeklyReport flow (Cloud Scheduler, Sunday)"]
        CB["Context builder: intent → targeted retrieval →
            deterministic calc → Gemini interprets facts"]
        Prompts["prompts/ (versioned)"]
        SW --> CB
        CA --> CB
        WR --> CB
        CB --> Prompts
    end

    State <-->|Auth session| Auth
    State <-->|reads + write-through autosave| FS
    State -->|HTTPS callable + App Check| SW
    UI -->|chat| CA
    WR -->|writes weeklyReports| FS
    Secrets["Secret Manager: GEMINI_API_KEY"] --> Server
```

## Layers

1. **Presentation** (`src/screens/`) — one screen per nav tab; large-print
   components in `src/components/`; controlled inputs only.
2. **State** (`src/workout/`, screen hooks) — focused hooks own screen state,
   workout lifecycle, and sync status. Persistent workout state is stored in
   Firestore rather than a separate reducer/context store.
3. **Data** (`src/data/`) — Firestore repositories per collection, Zod-validated
   on writes; persistent offline cache and write-through autosave; previous-
   weight lookup via `exerciseStats` rollups with history fallback.
4. **Server** (`functions/src/`) — Genkit flows, deterministic calculators,
   context builders, prompt modules. Admin SDK only here.

Client and server share only Zod schemas and pure types (`src/shared/`).

## Data flow: logging a set

1. A workout starts by atomically writing an `in_progress` session and its
   exercise documents in one Firestore batch.
2. User changes a weight, note, symptom, or set → the screen updates and the
   repository writes the validated value through to Firestore immediately.
3. Firestore's persistent local cache queues writes offline and syncs them when
   connectivity returns; the chip shows SYNCING → SAVED (or OFFLINE).
4. On workout-area entry, recovery queries for an unfinished session and loads
   its exercises and sets before showing the plan. If the recovery check fails,
   starting a duplicate workout is blocked until the user retries.
5. On session completion, deterministic code recomputes `exerciseStats` and
   `personalRecords` from history (derived caches — sessions stay the source
   of truth).

## AI context pipeline (all flows)

1. **Determine intent** (which exercise / which question class).
2. **Retrieve only relevant records** (bounded queries: e.g. last N sessions
   for one exerciseKey).
3. **Compute numeric facts in deterministic code** (totals, deltas, streaks,
   PRs) — never asked of Gemini.
4. **Send the facts to Gemini** with a versioned prompt from
   `functions/src/ai/prompts/`.
5. **Gemini interprets** and returns typed structured output (Zod-validated).
6. **Store the recommendation + facts + promptVersion** (audit trail) and
   return it to the client.

The full database is never sent to Gemini. Missing data stays missing: the
flows answer "I don't have enough workout history yet." instead of inventing.

## Weight recommendation (deterministic shell around Gemini)

- Candidate weight math (increment direction, machine increment bounds) is
  computed in code from history + difficulty + pain reports.
- Safety gate first: if the session/exercise carries concerning symptom flags,
  no progression output at all — the response is the fixed safety copy
  (see `docs/AI-SAFETY.md`).
- Gemini's job is the explanation and the conservative judgment within the
  computed candidate range. Output: `{ suggestedWeight, reason, decision }`.
- The user decides: USE / KEEP / CHOOSE ANOTHER. The AI never writes
  `weightUsed`.

## Model and prompt configuration

- Model names resolve from one table (`functions/src/ai/models.ts`): environment
  variable override first, hardcoded default last. Call sites never hardcode a
  model name.
- Prompts are versioned files (`functions/src/ai/prompts/<name>.v<N>.ts`), each
  exporting `PROMPT_VERSION`; recommendations store the version used.

## Offline and recovery model

- Firestore's persistent local cache is the durable source for workout sessions,
  exercises, and sets. Repository writes are immediate; offline writes remain
  queued in the SDK cache for synchronization when the network returns.
- The session and its exercise drafts are committed atomically with status
  `in_progress`; the UI does not expose a partially created workout.
- On workout-area entry, the session hook finds and rehydrates the latest
  in-progress session, including exercise values and saved sets, before offering
  a new plan. A failed recovery check blocks a new start until retry succeeds.
- Refresh recovery uses Firestore's local cache and normal Firestore
  synchronization. There is no separate localStorage workout mirror.
- The SAVED / SYNCING / OFFLINE chip derives from connection state + pending
  write count.

## Security boundaries

- Identity: Firebase Auth on the client; verified ID tokens server-side. Path
  security by `request.auth.uid`; client-supplied uids are ignored.
- App Check enforced on AI callables (quota + history protection).
- `GEMINI_API_KEY` exists only in Secret Manager and the Functions runtime.
- Rules default-deny with shape validation; privileged writes only via Admin
  SDK.

## Deployment topology

Firebase Hosting (static Vite build + SPA fallback), Cloud Functions (2nd
gen), Firestore + Indexes + Rules via `firebase deploy`. Cloud Scheduler fires
`weeklyReport` Sundays (configurable hour) and, when enabled, reminder jobs
Mon/Wed/Fri.
