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
users/{uid}/installEvents/{eventId}            ← install funnel (append-only)
users/{uid}/fcmTokens/{tokenId}                ← device push registration
users/{uid}/reminderState/{tokenId}            ← server-derived send guard
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

## fcmTokens/{tokenId} — device push registration

| Field | Type | Notes |
|---|---|---|
| id | string ≤128 | equals doc id; deterministic hash of `token` |
| token | string ≤4096 | FCM registration token |
| timeZone | string ≤64 | IANA zone of the device (reminder wall clock) |
| platform | `web` | |
| createdAt / updatedAt | timestamp | refreshed on each registration |

Owner create/update with full validation; the reminder function deletes dead
tokens (FCM `registration-token-not-registered`) via the Admin SDK.

## reminderState/{tokenId} — server-derived send guard

| Field | Type | Notes |
|---|---|---|
| tokenId | string ≤128 | fcmTokens doc id |
| slot | string `YYYY-MM-DDTHH:mm` | the reminder occurrence already sent |
| sentAt | timestamp | |

Written only by the reminder function (Admin SDK); owner reads, client writes
denied. Prevents double-sends when scheduler runs overlap a slot window.

## installEvents/{eventId} — install funnel (declared late)

| Field | Type | Notes |
|---|---|---|
| id | string ≤40 | |
| type | `prompt_offered` \| `prompt_result` \| `installed` \| `nudge_shown` \| `nudge_dismissed` | |
| outcome | `accepted` \| `dismissed` \| null | on `prompt_result` |
| method | `browser_prompt` \| `home_screen` \| null | on `installed` |
| userAgent | string ≤400 | |
| createdAt | timestamp | append-only |

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
```(Exact validation of field shapes and enums lands with Phase 4 alongside its tests.)

Amendment 2026-09-23 (declared here first per the schema-change policy): the
AI-Logic transport decision made the V1 coach client-side, so three collections
change from server-only writes to owner writes with full validation —
`aiRecommendations` becomes owner create + decision-only update (`accepted`,
`finalWeightChosen`; all provenance fields immutable), `personalRecords` becomes
append-only create (never edit — AGENTS.md rule 10), and `exerciseStats` becomes
owner-writable as the rebuildable cache it already is. `weeklyReports` stays
server-only (Sunday function).

Amendment 2 (2026-09-24): `weeklyReports` becomes owner **create-only**
(append-only, never edited) so V1 can save reports permanently before the
Blaze/Functions phase; the Sunday function keeps its admin-SDK write path.

Amendment 3 (2026-09-24, declared here first per the schema-change policy):
push workout reminders add two collections — `fcmTokens` (owner-managed device
push registrations, deterministic doc id per token) and `reminderState`
(per-token send guard, Admin-SDK-written only). Additive; no existing
collections change. Also declared late: `installEvents` (append-only install
funnel, owner create + read) landed in commit `0eb05ae` and is now listed in
the tree above — no fields change with this amendment.

Amendment 4 (2026-09-24, declared here first per the schema-change policy):
install funnel observability for the iOS nudge banner adds two event types —
`nudge_shown` (recorded once per actual display) and `nudge_dismissed` (the
DISMISS tap only; closing the steps sheet is not a dismissal). Enum extension
only: no fields change, `outcome`/`method` stay null for both. Client Zod,
rules whitelist, and emulator tests ship in the same deploy.

## Schema-change policy

1. Declare the change here first (AGENTS.md rule 8).
2. Additive only: new optional fields ship freely; new required fields require
  a backfill plan; renames/removals require a written migration.
3. Client, Functions, and rules update in the same deploy.
4. History collections (`workoutSessions` and below) are append-only — a
  migration never rewrites past workouts (AGENTS.md rule 10).

## bootFailures/{dedupeKey} — pre-React boot observability (declared 2026-09-28)

Documents a *failure to start*, never anything the user did. No `uid` written
by the client, no email, no workout, weight, or health-style field — the same
bar AGENTS.md sets for analytics events. A report can legitimately arrive from
an anonymous device, because a pre-React crash has no authenticated session.

| Field | Type | Notes |
|---|---|---|
| `buildId` | string <=40 | Matches the ID in the app header; identifies the deploy |
| `stage` | `'boot' \| 'window-error' \| 'render'` | `boot` = React never mounted |
| `message` | string <=300 | Truncated client-side *and* server-side |
| `platform` | string <=40, optional | Coarse only; never the full user agent (a fingerprint) |
| `standalone` | bool, optional | Installed home-screen app — worst case for a blank screen |
| `elapsedMs` | int 0..600000, optional | Page start → failure, to spot slow-network boots |
| `uid` | string \| null | Written by the Function from the **verified token only**; null when anonymous |
| `count` | int | Repeats within a 10-minute window increment this instead of creating documents |
| `firstSeenAt` / `lastSeenAt` | ISO string | |

Write path: `reportBootFailure` (2nd gen HTTPS) with the Admin SDK, which
bypasses rules. It is a public write path by necessity — no App Check, no
auth — because a broken app shell often cannot complete either handshake. That
makes the guards load-bearing: Zod length caps and enumeration, explicit field
allow-listing (extra client fields are dropped, not stored), Firestore-safe
dedupe keys, `no-store` on the endpoint, and a count-based dedupe window so a
reload loop cannot grow the collection or the bill. A write that fails still
returns 202 so a broken client never enters a retry storm.

Read path: **none from any client.** `firestore.rules` denies
`bootFailures/{key}` explicitly (`allow read, write: if false`) rather than
relying on the catch-all, so intent survives future edits. Operators read via
the console or the Admin SDK. Emulator tests in `tests/firestore.rules.test.ts`
assert signed-in writes, anonymous writes, and owner reads are all denied.

Amendment 5 (2026-09-28, declared here first per the schema-change policy):
additive — one new Admin-SDK-only collection plus its intake function. No
existing collection, field, or rule changes.
