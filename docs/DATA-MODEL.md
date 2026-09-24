# Data Model

Firestore schema for Gym Progress AI. Collections are namespaced under
`users/{uid}` so multi-user support is a rules-and-query concern only. All
writes are Zod-validated at the repository boundary. Schema changes follow the
policy at the bottom — additive, declared here first, never silent.

## Collection tree

```
users/{uid}
users/{uid}/settings/profile
users/{uid}/workoutTemplates/{templateId}
users/{uid}/workoutSessions/{sessionId}
users/{uid}/workoutSessions/{sessionId}/exercises/{exerciseId}
users/{uid}/workoutSessions/{sessionId}/exercises/{exerciseId}/sets/{setId}
users/{uid}/exerciseStats/{exerciseKey}          ← derived cache
users/{uid}/aiRecommendations/{recommendationId}
users/{uid}/weeklyReports/{reportId}
users/{uid}/personalRecords/{recordId}
```

## users/{uid}

| Field | Type | Notes |
|---|---|---|
| displayName | string | |
| weightUnit | `lb` \| `kg` | default `lb` |
| defaultRestSeconds | `60` \| `75` \| `90` | default `75` |
| aiRecommendationsEnabled | boolean | default true |
| largeTextEnabled | boolean | default **true** |
| machineIncrements | map<string, number> | exerciseKey → step in current unit |
| reminderTimes | map<string, string> | `mon`/`wed`/`fri` → `HH:mm` |
| createdAt / updatedAt | timestamp | |

`users/{uid}/settings/profile` carries the same profile document shape (the
brief's requested `settings/profile` path is kept authoritative for UI reads;
`users/{uid}` root doc holds membership metadata only: displayName, createdAt).

## workoutTemplates/{templateId}

| Field | Type | Notes |
|---|---|---|
| name | string | e.g. "Strength + Bike" |
| weekday | `1` \| `3` \| `5` | Mon / Wed / Fri |
| workoutType | string | `strength_bike` \| `balance_strength` \| `full_body_walk` |
| exercises | array<TemplateExercise> | ordered |

TemplateExercise: `{ key, name, order, kind: 'resistance'|'cardio'|'stretch'|'balance', targetSets, targetRepsMin, targetRepsMax, durationMinutes?, tip, altOf? }`
(`altOf` covers "Leg Extension OR Step-ups" and "Cable Core or Ab Machine".)

The three templates ship as seed constants (PROJECT-SPEC §2) and are written to
this collection once per user on first login.

## workoutSessions/{sessionId}

| Field | Type | Notes |
|---|---|---|
| id | string | matches doc id |
| userId | string | equals uid; informational only (rules use `request.auth.uid`) |
| templateId | string | |
| workoutType | string | as template |
| scheduledDate | string `YYYY-MM-DD` | |
| startedAt / completedAt | timestamp \| null | |
| status | `not_started` \| `in_progress` \| `completed` \| `abandoned` | |
| overallEffort | `easy` \| `good` \| `hard` \| null | recorded at completion |
| painReported | boolean | safety gate input |
| dizzinessReported | boolean | safety gate input |
| shortnessOfBreathReported | boolean | safety gate input |
| notes | string | |
| createdAt / updatedAt | timestamp | |

### exercises/{exerciseId}

| Field | Type | Notes |
|---|---|---|
| exerciseKey | string | stable key, e.g. `leg-press` |
| exerciseName | string | display name |
| exerciseOrder | number | |
| targetSets / targetRepsMin / targetRepsMax | number | |
| weightUsed / weightUnit | number / `lb`\|`kg` | the user's chosen weight |
| difficulty | `easy` \| `good` \| `hard` \| null | |
| painStatus | `none` \| `mild` \| `stopped` \| null | safety gate input |
| completed | boolean | |
| durationMinutes | number \| null | cardio/stretch/balance |
| previousWeight | number \| null | copied from exerciseStats at session build |
| aiSuggestedWeight | number \| null | |
| aiRecommendationId | string \| null | audit link |
| notes | string | |
| createdAt / updatedAt | timestamp | |

#### sets/{setId}

| Field | Type | Notes |
|---|---|---|
| setNumber | number | 1-based |
| weight | number | |
| reps | number | |
| completed | boolean | |
| createdAt | timestamp | |

## exerciseStats/{exerciseKey} — derived cache

| Field | Type | Notes |
|---|---|---|
| lastWeight / lastReps[] / lastDifficulty | number / number[] / enum | |
| highestWeight | number | PR detection input |
| totalSessions | number | |
| lastWorkoutDate | string `YYYY-MM-DD` | |
| updatedAt | timestamp | |

Recomputed deterministically from completed sessions (on completion and by a
rebuild routine). **Never** a source of truth over sessions; if in doubt, it is
rebuilt.

## aiRecommendations/{recommendationId} — audit trail

| Field | Type | Notes |
|---|---|---|
| exerciseKey / date | string | |
| previousWeight / suggestedWeight | number | |
| reason | string | the explanation shown to the user |
| accepted | `null` \| `true` \| `false` | null until the user decides |
| finalWeightChosen | number \| null | what the user actually used |
| model | string | resolved model id |
| promptVersion | string | exact prompt used |
| contextFacts | map | the deterministic facts the AI saw |
| blockedBySafety | boolean | symptom gate fired |
| createdAt | timestamp | |

## weeklyReports/{reportId}

| Field | Type | Notes |
|---|---|---|
| weekStart / weekEnd | string `YYYY-MM-DD` | Mon–Sun |
| planned / completed / completionRate | number / number / number | |
| strengthChanges | array<{ exerciseKey, from, to }> | |
| cardioMinutes | number | |
| prs | array<{ exerciseKey, weight, date }> | |
| missed | array<string> | scheduled dates not completed |
| facts | map | all deterministic stats computed that week |
| aiObservations | string[] | short Gemini commentary on the facts |
| nextWeek | array<{ exerciseKey, guidance }> | |
| createdAt | timestamp | |

## personalRecords/{recordId}

| Field | Type | Notes |
|---|---|---|
| exerciseKey | string | |
| weight / reps | number / number | |
| sessionId | string | proof link |
| achievedAt | timestamp | |

Written only when history proves a new highest weight.

## Indexes

- `workoutSessions`: `scheduledDate` DESC (+ `status` equality for the
  "resume" query).
- `workoutSessions/exercises`: `exerciseKey` ASC + `createdAt` DESC (previous-
  weight fallback and history views).

## Security rules sketch

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() { return request.auth != null; }
    function owns(uid)  { return signedIn() && request.auth.uid == uid; }

    match /users/{uid} {
      allow read, write: if owns(uid);
      match /settings/{doc}          { allow read, write: if owns(uid); }
      match /workoutTemplates/{id}   { allow read, write: if owns(uid); }
      match /exerciseStats/{key}     { allow read: if owns(uid);
                                       allow write: if false; } // server-derived
      match /personalRecords/{id}    { allow read: if owns(uid);
                                       allow write: if false; } // server-derived
      match /aiRecommendations/{id}  { allow read: if owns(uid);
                                       allow write: if false; } // server-only
      match /weeklyReports/{id}      { allow read: if owns(uid);
                                       allow write: if false; } // server-only
      match /workoutSessions/{sid} {
        allow read, write: if owns(uid);
        match /exercises/{eid} {
          allow read, write: if owns(uid);
          match /sets/{setId} { allow read, write: if owns(uid); }
        }
      }
    }
    match /{**} { allow read, write: if false; }   // default deny, catch-all last
  }
}
```

(Exact validation of field shapes and enums lands with Phase 4 alongside its
tests.)

## Schema-change policy

1. Declare the change here first (AGENTS.md rule 8).
2. Additive only: new optional fields ship freely; new required fields require
  a backfill plan; renames/removals require a written migration.
3. Client, Functions, and rules update in the same deploy.
4. History collections (`workoutSessions` and below) are append-only — a
  migration never rewrites past workouts (AGENTS.md rule 10).
