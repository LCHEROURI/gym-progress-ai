import { describe, expect, it } from "vitest";
import type { ExerciseFact, SessionFact } from "../progress/stats";
import { buildWeeklyReport, scheduledDates } from "./weekly";

const sessions: SessionFact[] = [
  { id: "s1", scheduledDate: "2026-09-21", status: "completed" },
  { id: "s2", scheduledDate: "2026-09-23", status: "completed" },
  { id: "s3", scheduledDate: "2026-09-25", status: "completed" },
];

const fact = (over: Partial<ExerciseFact>): ExerciseFact => ({
  sessionId: "s1",
  scheduledDate: "2026-09-21",
  exerciseKey: "leg-press",
  exerciseName: "Leg Press",
  completed: true,
  weightUsed: 70,
  difficulty: "good",
  durationMinutes: null,
  ...over,
});

const exercises: ExerciseFact[] = [
  fact({}),
  fact({ sessionId: "s3", scheduledDate: "2026-09-25", weightUsed: 75 }),
  fact({ exerciseKey: "chest-press", exerciseName: "Chest Press", weightUsed: 50 }),
  fact({ sessionId: "s3", scheduledDate: "2026-09-25", exerciseKey: "chest-press", exerciseName: "Chest Press", weightUsed: 50 }),
  fact({ exerciseKey: "bike", exerciseName: "Bike", weightUsed: null, durationMinutes: 20 }),
  fact({ sessionId: "s3", scheduledDate: "2026-09-25", exerciseKey: "bike", exerciseName: "Bike", weightUsed: null, durationMinutes: 22 }),
];

const older: ExerciseFact[] = [
  fact({ sessionId: "s0", scheduledDate: "2026-09-14", weightUsed: 65 }),
];

describe("buildWeeklyReport (Sep 21–27)", () => {
  const report = buildWeeklyReport({
    weekStart: "2026-09-21",
    sessions,
    exercises,
    allTimeExercises: [...older, ...exercises],
  });

  it("plans 3, completes 3, misses none", () => {
    expect(scheduledDates("2026-09-21")).toEqual(["2026-09-21", "2026-09-23", "2026-09-25"]);
    expect([report.planned, report.completed, report.completionRate]).toEqual([3, 3, 1]);
    expect(report.missed).toEqual([]);
    expect(report.weekEnd).toBe("2026-09-27");
  });

  it("shows strength changes 70 -> 75 and 50 -> 50", () => {
    expect(report.strengthChanges).toEqual([
      { exerciseKey: "chest-press", from: 50, to: 50 },
      { exerciseKey: "leg-press", from: 70, to: 75 },
    ]);
  });

  it("sums 42 cardio minutes", () => {
    expect(report.cardioMinutes).toBe(42);
  });

  it("detects the week's PR against all-time history", () => {
    expect(report.prs).toEqual([{ exerciseKey: "leg-press", weight: 75, date: "2026-09-25" }]);
  });

  it("guides next week per machine (brief's exact shapes)", () => {
    const byKey = Object.fromEntries(report.nextWeek.map((n) => [n.exerciseKey, n.guidance]));
    expect(byKey["leg-press"]).toBe("Consider maintaining 75 lb until it feels comfortable.");
    expect(byKey["chest-press"]).toBe(
      "Consider a small increase if target repetitions remain comfortable.",
    );
  });
});

describe("buildWeeklyReport with a missed session", () => {
  it("lists missed scheduled dates and lowers the rate", () => {
    const report = buildWeeklyReport({
      weekStart: "2026-09-21",
      sessions: sessions.slice(0, 2),
      exercises: exercises.filter((e) => e.scheduledDate === "2026-09-21"),
    });
    expect(report.missed).toEqual(["2026-09-25"]);
    expect(report.completed).toBe(2);
    expect(report.completionRate).toBeCloseTo(2 / 3);
  });
});
