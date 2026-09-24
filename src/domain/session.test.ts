import { describe, expect, it } from "vitest";
import { MONDAY } from "./templates";
import {
  buildExerciseSession,
  buildSession,
  canTransition,
  progressionBlocked,
  workoutSessionSchema,
} from "./session";

const input = {
  sessionId: "s1",
  uid: "u1",
  template: MONDAY,
  scheduledDate: "2026-09-28",
  now: new Date("2026-09-28T09:00:00Z"),
};

describe("workoutSessionSchema", () => {
  it("accepts a built session", () => {
    expect(() => workoutSessionSchema.parse(buildSession(input))).not.toThrow();
  });

  it("rejects unknown status and extra fields (strict)", () => {
    const s = buildSession(input);
    expect(() => workoutSessionSchema.parse({ ...s, status: "finished" })).toThrow();
    expect(() => workoutSessionSchema.parse({ ...s, extra: 1 } as never)).toThrow();
  });

  it("rejects notes over 1000 chars (mirrors rules)", () => {
    const s = buildSession(input);
    expect(() => workoutSessionSchema.parse({ ...s, notes: "n".repeat(1001) })).toThrow();
  });
});

describe("canTransition (mirrors firestore.rules)", () => {
  it("allows the normal lifecycle", () => {
    expect(canTransition("not_started", "in_progress")).toBe(true);
    expect(canTransition("in_progress", "completed")).toBe(true);
    expect(canTransition("in_progress", "abandoned")).toBe(true);
    expect(canTransition("completed", "in_progress")).toBe(true);
  });

  it("rejects skips and terminal edits", () => {
    expect(canTransition("not_started", "completed")).toBe(false);
    expect(canTransition("not_started", "abandoned")).toBe(false);
    expect(canTransition("completed", "abandoned")).toBe(false);
  });
});

describe("buildExerciseSession", () => {
  it("pre-fills weight from history for resistance exercises", () => {
    const e = buildExerciseSession({
      template: MONDAY,
      order: 2,
      previousWeight: 70,
      weightUnit: "lb",
      now: input.now,
    });
    expect([e.exerciseKey, e.previousWeight, e.weightUsed]).toEqual(["leg-press", 70, 70]);
  });

  it("carries minutes, no weight, for cardio", () => {
    const e = buildExerciseSession({
      template: MONDAY,
      order: 1,
      previousWeight: 70,
      weightUnit: "lb",
      now: input.now,
    });
    expect(e.durationMinutes).not.toBeNull();
    expect(e.weightUsed).toBeNull();
  });
});

describe("progressionBlocked (safety gate)", () => {
  it("blocks on any concerning symptom", () => {
    expect(progressionBlocked({ painReported: true, dizzinessReported: false, shortnessOfBreathReported: false, painStatus: "none" })).toBe(true);
    expect(progressionBlocked({ painReported: false, dizzinessReported: false, shortnessOfBreathReported: false, painStatus: "stopped" })).toBe(true);
  });

  it("allows clean sessions and mild discomfort", () => {
    expect(progressionBlocked({ painReported: false, dizzinessReported: false, shortnessOfBreathReported: false, painStatus: "none" })).toBe(false);
    expect(progressionBlocked({ painReported: false, dizzinessReported: false, shortnessOfBreathReported: false, painStatus: "mild" })).toBe(false);
  });
});
