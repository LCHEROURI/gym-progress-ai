import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchProgressFacts: vi.fn(async () => ({ sessions: [], exercises: [] })),
  saveWeeklyReport: vi.fn(async () => {}),
  weeklyObservations: vi.fn(async () => ({
    aiObservations: ["You completed all scheduled workouts this week."],
    model: "gemini-2.5-flash",
    promptVersion: "weekly-observations-v1",
  })),
}));

vi.mock("../data/progress", () => ({ fetchProgressFacts: mocks.fetchProgressFacts }));
vi.mock("./repository", () => ({ saveWeeklyReport: mocks.saveWeeklyReport }));
vi.mock("./observations", () => ({ weeklyObservations: mocks.weeklyObservations }));

import { generateWeeklyReport } from "./generate";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateWeeklyReport", () => {
  it("builds the report, attaches observations, and stores it once", async () => {
    const report = await generateWeeklyReport({
      ctx: { db: {} as never },
      app: {} as never,
      uid: "u1",
      weekStart: "2026-09-21",
    });
    expect(report.weekEnd).toBe("2026-09-27");
    expect(report.aiObservations).toEqual(["You completed all scheduled workouts this week."]);
    expect(mocks.saveWeeklyReport).toHaveBeenCalledOnce();
    const saved = (mocks.saveWeeklyReport.mock.calls[0] as unknown[])[3 - 1] as {
      aiObservations: string[];
    };
    expect(saved.aiObservations).toHaveLength(1);
  });
});
