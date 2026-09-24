import { describe, expect, it } from "vitest";
import {
  buildRecoveryInfo,
  lastCompleted,
  nextWorkout,
  recoveryTip,
  weeklyCompletion,
  type RecoverySession,
} from "./recovery";

const thu = new Date("2026-09-24T12:00:00Z");
const done: RecoverySession = {
  scheduledDate: "2026-09-21",
  status: "completed",
  workoutType: "strength_bike",
};

describe("recovery-day facts", () => {
  it("points to the next scheduled workout, skipping rest days", () => {
    expect(nextWorkout(thu)).toMatchObject({ date: "2026-09-25" });
    expect(nextWorkout(new Date("2026-09-25T12:00:00Z"))).toMatchObject({ date: "2026-09-28" });
    expect(nextWorkout(new Date("2026-09-27T12:00:00Z"))).toMatchObject({ date: "2026-09-28" });
    expect(nextWorkout(thu).template.name).toBe("Full Body + Walk");
  });

  it("shows the newest completed workout and ignores unfinished ones", () => {
    const last = lastCompleted([
      done,
      { scheduledDate: "2026-09-23", status: "in_progress", workoutType: "balance_strength" },
    ]);
    expect(last).toMatchObject({ weekday: "Monday", name: "Strength + Bike" });
    expect(lastCompleted([])).toBeNull();
  });

  it("counts this week's completed workouts against three planned", () => {
    expect(weeklyCompletion([done], thu)).toEqual({ completed: 1, planned: 3 });
    expect(weeklyCompletion([], thu)).toEqual({ completed: 0, planned: 3 });
  });

  it("builds the full info block with a deterministic tip", () => {
    const info = buildRecoveryInfo([done], thu);
    expect(info.next).toMatchObject({ weekday: "Friday", name: "Full Body + Walk" });
    expect(info.week).toEqual({ completed: 1, planned: 3 });
    expect(info.tip).toBe(recoveryTip({ week: info.week, hasLast: true }));
  });

  it("never fabricates: empty history gets the first-workout tip", () => {
    const info = buildRecoveryInfo([], thu);
    expect(info.last).toBeNull();
    expect(info.tip).toContain("first workout");
  });
});
