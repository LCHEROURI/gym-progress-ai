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
      blockedBySafety: false,
    });
    expect(r.reason).toContain("small increase may be reasonable");
  });

  it("keeps after insufficient data", () => {
    const r = recommendWeight({ ...base, loads: [] });
    expect(r).toMatchObject({ action: "keep", previousWeight: null, suggestedWeight: 0 });
  });

  it("keeps when difficulty was hard", () => {
    const r = recommendWeight({ ...base, loads: [load({ difficulty: "hard" })] });
    expect(r).toMatchObject({ action: "keep", suggestedWeight: 70 });
  });

  it("keeps when reps were missed last time", () => {
    const r = recommendWeight({ ...base, loads: [load({ repsPerSet: [10, 8] })] });
    expect(r).toMatchObject({ action: "keep", suggestedWeight: 70 });
  });

  it("decreases after two straight missed sessions", () => {
    const r = recommendWeight({
      ...base,
      loads: [load({ repsPerSet: [9, 9] }), load({ repsPerSet: [8, 7] })],
    });
    expect(r).toMatchObject({ action: "decrease", suggestedWeight: 65 });
  });

  it("keeps after a recent increase unless it felt easy", () => {
    const r = recommendWeight({
      ...base,
      loads: [load({ weight: 75 }), load({ weight: 70 })],
    });
    expect(r).toMatchObject({ action: "keep", suggestedWeight: 75 });
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
