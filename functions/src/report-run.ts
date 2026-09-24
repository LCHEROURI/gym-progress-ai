/**
 * Pure core of the Sunday weekly-report run — no firebase-admin imports, so the
 * web workspace typechecks and tests it directly
 * (tests/functions-report-run.test.ts). Only Firestore wiring lives in
 * index.ts.
 */
import { exerciseSessionSchema, workoutSessionSchema } from "../../src/domain/session";
import type { ExerciseFact, SessionFact } from "../../src/progress/stats";
import {
  cleanObservationLines,
  deterministicObservations,
} from "../../src/reports/observations-core";
import { weeklyReportSchema, type WeeklyReport } from "../../src/reports/weekly";

interface TimestampLike {
  toDate: () => Date;
}

function isTimestampLike(value: unknown): value is TimestampLike {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as TimestampLike).toDate === "function"
  );
}

/**
 * The Admin SDK returns Timestamps where the client SDK returns Dates; the
 * Zod schemas expect Dates. Convert before validating.
 */
export function reviveTimestamps(value: unknown): unknown {
  if (isTimestampLike(value)) return value.toDate();
  if (Array.isArray(value)) return value.map(reviveTimestamps);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, reviveTimestamps(v)]),
    );
  }
  return value;
}

/** Workout session doc → the fact shape the deterministic engine consumes. */
export function sessionFactFrom(data: unknown): SessionFact {
  const s = workoutSessionSchema.parse(reviveTimestamps(data));
  return { id: s.id, scheduledDate: s.scheduledDate, status: s.status };
}

/** Exercise doc → fact; scheduledDate comes from the parent session. */
export function exerciseFactFrom(
  sessionId: string,
  scheduledDate: string,
  data: unknown,
): ExerciseFact {
  const e = exerciseSessionSchema.parse(reviveTimestamps(data));
  return {
    sessionId,
    scheduledDate,
    exerciseKey: e.exerciseKey,
    exerciseName: e.exerciseName,
    completed: e.completed,
    weightUsed: e.weightUsed,
    difficulty: e.difficulty,
    durationMinutes: e.durationMinutes,
  };
}

/** Only users with recorded workouts get reports — never fabricate. */
export function shouldGenerateReport(sessions: SessionFact[]): boolean {
  return sessions.length > 0;
}

/**
 * Attach observations to the draft and re-validate: Gemini's lines when they
 * parse, otherwise the deterministic voice derived from the same facts.
 */
export function finalizeReport(draft: WeeklyReport, modelText: string | null): WeeklyReport {
  const lines = modelText ? cleanObservationLines(modelText) : [];
  const aiObservations = lines.length > 0 ? lines : deterministicObservations(draft);
  return weeklyReportSchema.parse({ ...draft, aiObservations });
}
