import { describe, expect, it } from "vitest";
import type { ExerciseFact, SessionFact } from "../progress/stats";
import { buildCoachContext } from "./context";
import type { CoachIntent } from "./intent";

const sessions: SessionFact[] = [
  { id: "s1", scheduledDate: "2026-09-07", status: "completed" },
  { id: "s2", scheduledDate: "2026-09-09", status: "completed" },
  { id: "s3", scheduledDate: "2026-09-11", status: "completed" },
];

const fact = (over: Partial<ExerciseFact>): ExerciseFact => ({
  sessionId: "s1",
  scheduledDate: "2026-09-07",
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
  fact({ sessionId: "s2", scheduledDate: "2026-09-09", weightUsed: 72 }),
  fact({ sessionId: "s3", scheduledDate: "2026-09-11", weightUsed: 75 }),
  fact({ exerciseKey: "chest-press", exerciseName: "Chest Press", weightUsed: 50 }),
  fact({ sessionId: "s2", scheduledDate: "2026-09-09", exerciseKey: "chest-press", exerciseName: "Chest Press", weightUsed: 50 }),
];

const today = new Date("2026-09-27T12:00:00Z");
const ctx = (intent: CoachIntent, exerciseKey: string | null = null) =>
  buildCoachContext({
    classified: { intent, exerciseKey },
    sessions,
    exercises,
    today,
  });

describe("buildCoachContext", () => {
  it("flags insufficient history before any model call is possible", () => {
    const empty = buildCoachContext({
      classified: { intent: "workoutsCount", exerciseKey: null },
      sessions: [],
      exercises,
      today,
    });
    expect(empty.insufficient).toBe(true);
  });

  it("counts workouts deterministically", () => {
    const c = ctx("workoutsCount");
    expect(c.facts).toMatchObject({ totalWorkouts: 3, workoutsThisMonth: 3 });
    expect(c.summaryLines[0]).toBe("You completed 3 workouts this month (3 in total).");
  });

  it("summarizes one exercise's progress with its series", () => {
    const c = ctx("progress", "leg-press");
    expect(c.facts).toMatchObject({
      startingWeight: 70,
      currentWeight: 75,
      highestWeight: 75,
      totalSessions: 3,
      trend: "up",
    });
    expect((c.facts.points as unknown[]).length).toBe(3);
  });

  it("ranks most improved and names stalled machines", () => {
    const improved = ctx("mostImproved");
    expect(improved.summaryLines[0]).toContain("Leg Press, +5 lb");
    const stalled = ctx("stalled");
    expect(stalled.summaryLines[0]).toContain("Chest Press");
  });

  it("lists machines for weight questions", () => {
    const c = ctx("weightToday");
    expect(c.summaryLines).toHaveLength(2);
    expect(c.summaryLines[0]).toContain("lb");
  });
});
