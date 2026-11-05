import { describe, expect, it } from "vitest";
import { SAFETY_MESSAGE, recommendWeight, type ExerciseLoad } from "./progression";

const load = (over: Partial<ExerciseLoad>): ExerciseLoad => ({
  weight: 70,
  repsPerSet: [10, 10],
  difficulty: "good",
  painStatus: "none",
  symptoms: { pain: false, dizziness: false, shortnessOfBreath: false },
  ...over,
});

const base = { targetSets: 2, targetRepsMin: 10, increment: 5 };

describe("recommendWeight", () => {
  it("increases after comfortable target reps (the brief's Leg Press example)", () => {
    const r = recommendWeight({ ...base, loads: [load({})] });
    expect(r).toMatchObject({
      action: "increase",
      previousWeight: 70,
      suggestedWeight: 75,
      previousReps: [10, 10],
      suggestedReps: 10,
      targetSets: 2,
      lastDifficulty: "good",
      blockedBySafety: false,
    });
    expect(r.reason).toContain("small increase may be reasonable");
    expect(r.reason).toContain("75 lb for 2 sets of 10 controlled reps");
    expect(r.reason).toContain("muscle mass building at 73");
  });

  it("advises top-of-range reps when previous sets felt easy on a variable rep target", () => {
    const r = recommendWeight({
      ...base,
      targetRepsMin: 8,
      targetRepsMax: 10,
      loads: [load({ repsPerSet: [10, 10], difficulty: "easy" })],
    });
    expect(r).toMatchObject({
      action: "increase",
      previousWeight: 70,
      suggestedWeight: 75,
      previousReps: [10, 10],
      suggestedReps: 10,
      lastDifficulty: "easy",
    });
    expect(r.reason).toContain("75 lb for 2 sets of 10 controlled reps");
  });

  it("keeps after insufficient data", () => {
    const r = recommendWeight({ ...base, loads: [] });
    expect(r).toMatchObject({
      action: "keep",
      previousWeight: null,
      suggestedWeight: 0,
      previousReps: [],
      suggestedReps: 10,
    });
  });

  it("keeps when difficulty was hard and advises smooth target reps for recovery at 73", () => {
    const r = recommendWeight({ ...base, loads: [load({ difficulty: "hard" })] });
    expect(r).toMatchObject({
      action: "keep",
      suggestedWeight: 70,
      previousReps: [10, 10],
      suggestedReps: 10,
      lastDifficulty: "hard",
    });
    expect(r.reason).toContain("73-year-old building muscle mass");
    expect(r.reason).toContain("keep 70 lb and perform 2 sets of 10 smooth reps");
  });

  it("keeps when reps were missed last time and advises building back to target reps", () => {
    const r = recommendWeight({ ...base, loads: [load({ repsPerSet: [10, 8] })] });
    expect(r).toMatchObject({
      action: "keep",
      suggestedWeight: 70,
      previousReps: [10, 8],
      suggestedReps: 10,
    });
    expect(r.reason).toContain("10, 8 reps at 70 lb");
    expect(r.reason).toContain("2 sets of 10 controlled reps");
  });

  it("decreases after two straight missed sessions and advises rebuilding volume", () => {
    const r = recommendWeight({
      ...base,
      loads: [load({ repsPerSet: [9, 9] }), load({ repsPerSet: [8, 7] })],
    });
    expect(r).toMatchObject({
      action: "decrease",
      suggestedWeight: 65,
      previousReps: [9, 9],
      suggestedReps: 10,
    });
    expect(r.reason).toContain("Step back to 65 lb for 2 sets of 10 controlled reps");
  });

  it("keeps after a recent increase unless it felt easy, advising rep consolidation", () => {
    const r = recommendWeight({
      ...base,
      loads: [load({ weight: 75 }), load({ weight: 70 })],
    });
    expect(r).toMatchObject({
      action: "keep",
      suggestedWeight: 75,
      previousReps: [10, 10],
      suggestedReps: 12,
    });
    const easy = recommendWeight({
      ...base,
      loads: [load({ weight: 75, difficulty: "easy" }), load({ weight: 70 })],
    });
    expect(easy.action).toBe("increase");
  });

  it("blocks progression on any concerning symptom with the exact safety copy", () => {
    const r = recommendWeight({
      ...base,
      loads: [load({ symptoms: { pain: false, dizziness: true, shortnessOfBreath: false } })],
    });
    expect(r).toMatchObject({ action: "keep", blockedBySafety: true, suggestedWeight: 70 });
    expect(r.reason).toBe(SAFETY_MESSAGE);

    const stopped = recommendWeight({ ...base, loads: [load({ painStatus: "stopped" })] });
    expect(stopped.blockedBySafety).toBe(true);
  });

  it("keeps after mild discomfort", () => {
    const r = recommendWeight({ ...base, loads: [load({ painStatus: "mild" })] });
    expect(r).toMatchObject({ action: "keep", suggestedWeight: 70 });
  });
});
