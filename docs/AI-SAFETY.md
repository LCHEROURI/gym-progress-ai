# AI Safety

Gemini in Gym Progress AI is an **advisor with a calculator brain and no
authority**. It interprets facts that deterministic code computed from the
user's real history. It never changes the workout, never invents history, and
never gives medical direction. This document is enforced by tests in
`docs/TEST-PLAN.md` and governed by AGENTS.md rules 6, 10, 11, 12.

## 1. Advisory-only invariant

- AI output is a **suggestion**. The user always decides: `[ USE … ]`,
  `[ KEEP … ]`, `[ CHOOSE ANOTHER ]`.
- AI never writes `weightUsed`, never edits sets/reps, never marks exercises
  complete, never reschedules workouts.
- Every suggestion carries a `reason` grounded in the user's own numbers.

## 2. No fabrication

- The context builder sends only records that exist. Missing data stays
  missing.
- With insufficient history the answer is exactly:
  **"I don't have enough workout history yet."**
- Totals, deltas, streaks, PRs, completion rates are computed in deterministic
  code before Gemini sees them (ARCHITECTURE.md "AI context pipeline").

## 3. Medical boundaries

The AI must **not**:

- diagnose medical conditions,
- change, start, or stop medications,
- tell the user to push through concerning symptoms,
- interpret pain/symptom reports medically.

Symptom words in notes are never fed to Gemini as diagnostic material.

## 4. Symptom safety gate

If the session or exercise records any of: **chest discomfort, significant
dizziness, faintness, unusual shortness of breath, severe pain, loss of
balance** (session flags `painReported` / `dizzinessReported` /
`shortnessOfBreathReported`, or exercise `painStatus: 'stopped'`):

1. Progression recommendations are suppressed for that exercise and session
   (`blockedBySafety: true` on the recommendation record).
2. The fixed copy is shown instead of any suggestion:
   **"Do not increase resistance based on this session."**
3. The session summary may not celebrate load increases from that session.

The gate runs in deterministic code BEFORE any Gemini call.

## 5. Conservative progression rules

Gemini is advisory (rule 1), but its suggestions follow these starting
guidelines, with the user-configurable machine increment as the step size:

| Context | Typical smallest increase |
|---|---|
| Upper body | 2.5–5 lb |
| Lower body | 5–10 lb |

Machines differ — never assume increments; use the per-exercise
`machineIncrements` setting.

### Keep the current weight when

- difficulty was `hard`, or
- target repetitions were barely completed, or
- a recent increase already happened, or
- training data is insufficient.

Output: `KEEP CURRENT WEIGHT` with the reason.

### Consider a conservative decrease when

- target repetitions were repeatedly missed, or
- difficulty/pain reports indicate excessive resistance (`painStatus: mild` or
  worse), or
- the exercise was stopped.

The decrease is conservative and the reason is explicit.

### Increase only when

- all sets completed at target reps, and
- difficulty was `easy` or `good`, and
- no symptom flags, and
- the increment matches the machine increment setting.

## 6. Prompt safety and versioning

- Prompts live in `functions/src/ai/prompts/` as versioned modules
  (`<name>.v<N>.ts`, exporting `PROMPT_VERSION`). UI code never carries raw
  prompts (AGENTS.md rule 2 scope note).
- Prompt text re-states these rules: suggestions only, no diagnosis, no
  fabrication, conservative defaults, explain with the user's numbers.
- Model ids resolve from `functions/src/ai/models.ts` (env override → default).
  Call sites never hardcode a model name.

## 7. Audit trail (AI output storage)

Every recommendation is stored permanently (`aiRecommendations` collection,
DATA-MODEL.md): exercise, date, previousWeight, suggestedWeight, reason,
accepted (null until decided), finalWeightChosen, model, promptVersion,
contextFacts, blockedBySafety, createdAt. This makes every AI claim
reconstructable and reviewable.

## 8. Fixed safety copy (exact strings)

| Situation | Copy |
|---|---|
| Symptom gate fired | "Do not increase resistance based on this session." |
| Insufficient history | "I don't have enough workout history yet." |
| Recommendation declined | "Keeping your previous weight." |

These strings are user-facing contracts; tests assert them verbatim.
