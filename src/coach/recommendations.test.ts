import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setDoc: vi.fn(async () => {}),
  updateDoc: vi.fn(async () => {}),
}));

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...path: string[]) => path.join("/"),
  setDoc: mocks.setDoc,
  updateDoc: mocks.updateDoc,
}));

import { SAFETY_MESSAGE, type Recommendation } from "./progression";
import {
  buildRecommendationRecord,
  recordDecision,
  saveRecommendation,
} from "./recommendations";

const ctx = { db: {} as never };
const rec: Recommendation = {
  action: "increase",
  previousWeight: 70,
  suggestedWeight: 75,
  reason: "Comfortable sets at target.",
  blockedBySafety: false,
  contextFacts: { rule: "progress" },
};
const now = new Date("2026-09-28T09:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildRecommendationRecord", () => {
  it("carries provenance fields the rules freeze later", () => {
    const record = buildRecommendationRecord({
      recommendation: rec,
      exerciseKey: "leg-press",
      date: "2026-09-28",
      model: "deterministic",
      promptVersion: "weight-explanation-v1",
      now,
    });
    expect(record).toMatchObject({
      exerciseKey: "leg-press",
      accepted: null,
      finalWeightChosen: null,
      blockedBySafety: false,
    });
  });

  it("records the safety flag and exact message", () => {
    const record = buildRecommendationRecord({
      recommendation: { ...rec, reason: SAFETY_MESSAGE, blockedBySafety: true },
      exerciseKey: "leg-press",
      date: "2026-09-28",
      model: "deterministic",
      promptVersion: "weight-explanation-v1",
      now,
    });
    expect(record.blockedBySafety).toBe(true);
  });
});

describe("saveRecommendation + recordDecision", () => {
  it("writes the validated audit row", async () => {
    const record = buildRecommendationRecord({
      recommendation: rec,
      exerciseKey: "leg-press",
      date: "2026-09-28",
      model: "deterministic",
      promptVersion: "weight-explanation-v1",
      now,
    });
    await saveRecommendation(ctx, "u1", "r1", record);
    expect(mocks.setDoc).toHaveBeenCalledOnce();
    const [ref] = mocks.setDoc.mock.calls[0] as unknown as [string];
    expect(ref).toBe("users/u1/aiRecommendations/r1");
  });

  it("rejects an invalid row without writing", async () => {
    await expect(
      saveRecommendation(ctx, "u1", "r1", { exerciseKey: "x".repeat(61) } as never),
    ).rejects.toThrow();
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it("updates only the decision fields", async () => {
    await recordDecision(ctx, "u1", "r1", { accepted: true, finalWeightChosen: 75 });
    const [, payload] = mocks.updateDoc.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(Object.keys(payload).sort()).toEqual(["accepted", "finalWeightChosen"]);
  });
});
