import { describe, expect, it } from "vitest";
import {
  buildExerciseProgress,
  buildProgressStats,
  detectPersonalRecords,
  scheduledCountThroughToday,
  type ExerciseFact,
  type SessionFact,
} from "./stats";

const sessions: SessionFact[] = [
  { id: "s1", scheduledDate: "2026-09-07", status: "completed" },
  { id: "s2", scheduledDate: "2026-09-09", status: "completed" },
  { id: "s3", scheduledDate: "2026-09-11", status: "completed" },
  { id: "s4", scheduledDate: "2026-09-14", status: "abandoned" },
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
  fact({ sessionId: "s2", scheduledDate: "2026-09-09", weightUsed: 75 }),
  fact({ sessionId: "s3", scheduledDate: "2026-09-11", weightUsed: 75 }),
  fact({ exerciseKey: "bike", exerciseName: "Bike", weightUsed: null, durationMinutes: 12 }),
  fact({ sessionId: "s2", scheduledDate: "2026-09-09", exerciseKey: "bike", exerciseName: "Bike", weightUsed: null, durationMinutes: 12 }),
];

const sunday = new Date("2026-09-13T12:00:00Z");

describe("buildProgressStats", () => {
  const stats = buildProgressStats({ sessions, exercises, today: sunday });

  it("counts 3 completed workouts, all this month", () => {
    expect([stats.totalWorkouts, stats.workoutsThisMonth]).toEqual([3, 3]);
  });

  it("shows the week 3 of 3 planned", () => {
    expect(stats.currentWeek).toEqual({ completed: 3, planned: 3 });
  });

  it("completion rate is completed / scheduled through today", () => {
    // Sep 2, 4, 7, 9, 11 are the Mon/Wed/Fri dates on or before Sep 13
    expect(scheduledCountThroughToday(sunday)).toBe(5);
    expect(stats.completionRate).toBe(0.6);
  });

  it("sums cardio minutes from completed cardio only", () => {
    expect(stats.totalCardioMinutes).toBe(24);
  });
});

describe("detectPersonalRecords", () => {
  it("takes the first session to reach the max weight (ties are not PRs)", () => {
    const prs = detectPersonalRecords(exercises);
    const legPress = prs.find((p) => p.exerciseKey === "leg-press");
    expect(legPress).toMatchObject({ weight: 75, achievedAt: "2026-09-09", sessionId: "s2" });
  });

  it("ignores cardio and incomplete entries", () => {
    const prs = detectPersonalRecords([
      fact({ completed: false, weightUsed: 300 }),
      fact({ exerciseKey: "bike", exerciseName: "Bike", weightUsed: null, durationMinutes: 12 }),
    ]);
    expect(prs.find((p) => p.exerciseKey === "bike")).toBeUndefined();
    expect(prs.find((p) => p.weight === 300)).toBeUndefined();
  });
});

describe("buildExerciseProgress", () => {
  it("tracks start/current/highest, sessions, and trend", () => {
    const [legPress] = buildExerciseProgress(exercises).filter(
      (e) => e.exerciseKey === "leg-press",
    );
    expect(legPress).toMatchObject({
      startingWeight: 70,
      currentWeight: 75,
      highestWeight: 75,
      totalSessions: 3,
      trend: "flat",
    });
    expect(legPress.points).toHaveLength(3);
  });
});
