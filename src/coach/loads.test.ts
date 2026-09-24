import { describe, expect, it } from "vitest";
import { buildExerciseSession, buildSession } from "../domain/session";
import { MONDAY } from "../domain/templates";
import type { HistoryDetail } from "../data/history";
import { buildLoads } from "./loads";

const t0 = new Date("2026-09-28T09:00:00Z");
const t1 = new Date("2026-09-25T09:00:00Z");

function detail(when: Date, date: string, weight: number, reps: number[], symptoms = false): HistoryDetail {
  const template = MONDAY;
  const session = {
    ...buildSession({ sessionId: `s-${date}`, uid: "u1", template, scheduledDate: date, now: when }),
    painReported: symptoms,
  };
  const exercises = template.exercises.map((t) => ({
    ...buildExerciseSession({ template, order: t.order, previousWeight: null, weightUnit: "lb", now: when }),
    completed: true,
    weightUsed: t.kind === "resistance" ? weight : null,
  }));
  const sets = reps.map((r, i) => ({
    exerciseKey: "leg-press",
    setNumber: i + 1,
    weight,
    reps: r,
    completed: true,
    createdAt: when,
  }));
  return { session, exercises, sets };
}

describe("buildLoads", () => {
  it("collects newest-first resistance loads with their set reps", () => {
    const loads = buildLoads([
      detail(t0, "2026-09-28", 75, [10, 10]),
      detail(t1, "2026-09-25", 70, [10, 9]),
    ]);
    expect(loads["leg-press"]).toHaveLength(2);
    expect(loads["leg-press"][0]).toMatchObject({ weight: 75, repsPerSet: [10, 10] });
    expect(loads["leg-press"][1]).toMatchObject({ weight: 70, repsPerSet: [10, 9] });
  });

  it("carries session symptoms and skips cardio work", () => {
    const loads = buildLoads([detail(t0, "2026-09-28", 75, [10], true)]);
    expect(loads["leg-press"][0].symptoms).toEqual({
      pain: true,
      dizziness: false,
      shortnessOfBreath: false,
    });
    expect(loads["bike"]).toBeUndefined();
    expect(loads["bike-warmup"]).toBeUndefined();
  });
});
