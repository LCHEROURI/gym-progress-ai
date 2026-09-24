import { describe, expect, it } from "vitest";
import {
  exerciseFactFrom,
  finalizeReport,
  reviveTimestamps,
  sessionFactFrom,
  shouldGenerateReport,
} from "../functions/src/report-run";
import { buildWeeklyReport, reportIdFor } from "../src/reports/weekly";

const ts = (d: Date) => ({ toDate: () => d });
const now = new Date("2026-09-27T12:00:00Z");

const sessionDoc = {
  id: "s1",
  userId: "u1",
  templateId: "mon-strength-bike",
  workoutType: "strength_bike",
  scheduledDate: "2026-09-21",
  startedAt: ts(new Date("2026-09-21T10:00:00Z")),
  completedAt: ts(new Date("2026-09-21T10:45:00Z")),
  status: "completed",
  overallEffort: "good",
  painReported: false,
  dizzinessReported: false,
  shortnessOfBreathReported: false,
  notes: "",
  createdAt: ts(new Date("2026-09-21T09:55:00Z")),
  updatedAt: ts(new Date("2026-09-21T10:45:00Z")),
};

const exerciseDoc = {
  exerciseKey: "leg-press",
  exerciseName: "Leg Press",
  exerciseOrder: 2,
  targetSets: 2,
  targetRepsMin: 10,
  targetRepsMax: 10,
  weightUsed: 75,
  weightUnit: "lb",
  difficulty: "good",
  painStatus: "none",
  completed: true,
  durationMinutes: null,
  previousWeight: 70,
  aiSuggestedWeight: 75,
  aiRecommendationId: null,
  notes: "",
  createdAt: ts(new Date("2026-09-21T10:05:00Z")),
  updatedAt: ts(new Date("2026-09-21T10:40:00Z")),
};

const draft = buildWeeklyReport({
  weekStart: "2026-09-21",
  sessions: [sessionFactFrom(sessionDoc)],
  exercises: [exerciseFactFrom("s1", "2026-09-21", exerciseDoc)],
  allTimeExercises: [exerciseFactFrom("s1", "2026-09-21", exerciseDoc)],
  now,
});

describe("Sunday report run (pure core)", () => {
  it("revives Admin-SDK Timestamps into Dates before validation", () => {
    const revived = reviveTimestamps({
      a: ts(now),
      b: ["x", ts(now)],
      c: 7,
    }) as { a: Date; b: unknown[]; c: number };
    expect(revived.a).toEqual(now);
    expect(revived.b[0]).toBe("x");
    expect(revived.b[1]).toEqual(now);
    expect(revived.c).toBe(7);
  });

  it("maps session and exercise docs to the engine's fact shapes", () => {
    expect(sessionFactFrom(sessionDoc)).toEqual({
      id: "s1",
      scheduledDate: "2026-09-21",
      status: "completed",
    });
    expect(exerciseFactFrom("s1", "2026-09-21", exerciseDoc)).toEqual({
      sessionId: "s1",
      scheduledDate: "2026-09-21",
      exerciseKey: "leg-press",
      exerciseName: "Leg Press",
      completed: true,
      weightUsed: 75,
      difficulty: "good",
      durationMinutes: null,
    });
  });

  it("generates reports only for users with recorded workouts", () => {
    expect(shouldGenerateReport([])).toBe(false);
    expect(shouldGenerateReport([sessionFactFrom(sessionDoc)])).toBe(true);
  });

  it("cleans Gemini output into bounded observation lines", () => {
    const report = finalizeReport(draft, "1. Great week.\n- Leg press felt strong.\n");
    expect(report.aiObservations).toEqual(["Great week.", "Leg press felt strong."]);
  });

  it("falls back to the deterministic voice when Gemini is absent or empty", () => {
    const report = finalizeReport(draft, null);
    expect(report.aiObservations.length).toBeGreaterThan(0);
    expect(report.aiObservations[0]).toContain("missed");
    expect(finalizeReport(draft, "   \n  ").aiObservations).toEqual(report.aiObservations);
  });

  it("keeps the deterministic report id so scheduler and app cannot collide", () => {
    expect(reportIdFor(draft.weekStart)).toBe("w2026-09-21");
  });
});
