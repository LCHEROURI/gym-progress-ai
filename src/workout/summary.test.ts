import { describe, expect, it } from "vitest";
import { buildExerciseSession, buildSession } from "../domain/session";
import { MONDAY } from "../domain/templates";
import { buildCompletionSummary, type LoggedSet } from "./summary";

const started = new Date("2026-09-28T09:00:00Z");
const finished = new Date("2026-09-28T09:46:00Z");

const session = {
  ...buildSession({
    sessionId: "s1",
    uid: "u1",
    template: MONDAY,
    scheduledDate: "2026-09-28",
    now: started,
  }),
  startedAt: started,
  completedAt: finished,
  status: "completed" as const,
};

const exercises = MONDAY.exercises.map((t) => ({
  ...buildExerciseSession({
    template: MONDAY,
    order: t.order,
    previousWeight: null,
    weightUnit: "lb",
    now: started,
  }),
  completed: true,
}));

const sets: LoggedSet[] = [];
for (const key of ["leg-press", "chest-press", "seated-row", "leg-curl"]) {
  for (const setNumber of [1, 2]) {
    sets.push({ exerciseKey: key, setNumber, weight: 70, reps: 10, completed: true, createdAt: started });
  }
}

describe("buildCompletionSummary", () => {
  const summary = buildCompletionSummary({
    session,
    template: MONDAY,
    exercises,
    sets,
    completedAt: finished,
  });

  it("counts exercises 7/7", () => {
    expect([summary.exercisesDone, summary.exercisesTotal]).toEqual([7, 7]);
  });

  it("counts 8 completed strength sets (2 x 4 machines)", () => {
    expect(summary.strengthSets).toBe(8);
  });

  it("sums cardio minutes from completed cardio work (6 + 12)", () => {
    expect(summary.cardioMinutes).toBe(18);
  });

  it("computes 46 minute duration from start to finish", () => {
    expect(summary.durationMinutes).toBe(46);
  });

  it("ignores incomplete sets and partial cardio", () => {
    const partial = buildCompletionSummary({
      session,
      template: MONDAY,
      exercises: exercises.map((e, i) => (i < 3 ? e : { ...e, completed: false })),
      sets: [...sets, { exerciseKey: "leg-press", setNumber: 3, weight: 70, reps: 5, completed: false, createdAt: started }],
    });
    expect(partial.exercisesDone).toBe(3);
    expect(partial.strengthSets).toBe(8);
    expect(partial.cardioMinutes).toBe(6);
  });
});
