import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateContent: vi.fn(),
}));

vi.mock("firebase/ai", () => ({
  GoogleAIBackend: class {},
  getAI: () => ({}),
  getGenerativeModel: () => ({ generateContent: mocks.generateContent }),
}));

import { deterministicObservations, weeklyObservations } from "./observations";
import { buildWeeklyReport } from "./weekly";

const report = buildWeeklyReport({
  weekStart: "2026-09-21",
  sessions: [
    { id: "s1", scheduledDate: "2026-09-21", status: "completed" },
    { id: "s2", scheduledDate: "2026-09-23", status: "completed" },
    { id: "s3", scheduledDate: "2026-09-25", status: "completed" },
  ],
  exercises: [
    { sessionId: "s1", scheduledDate: "2026-09-21", exerciseKey: "leg-press", exerciseName: "Leg Press", completed: true, weightUsed: 70, difficulty: "good", durationMinutes: null },
    { sessionId: "s3", scheduledDate: "2026-09-25", exerciseKey: "leg-press", exerciseName: "Leg Press", completed: true, weightUsed: 75, difficulty: "good", durationMinutes: null },
    { sessionId: "s1", scheduledDate: "2026-09-21", exerciseKey: "chest-press", exerciseName: "Chest Press", completed: true, weightUsed: 50, difficulty: "good", durationMinutes: null },
  ],
});

describe("deterministicObservations", () => {
  it("covers adherence and changes in the brief's voice", () => {
    const lines = deterministicObservations(report);
    expect(lines[0]).toBe("You completed all scheduled workouts this week.");
    expect(lines).toContain("You increased resistance on 1 exercise.");
    expect(lines).toContain("chest press remained stable.");
  });
});

describe("weeklyObservations", () => {
  it("uses the model's lines when available", async () => {
    mocks.generateContent.mockResolvedValueOnce({
      response: { text: () => "- Great adherence.\n- Leg press climbed." },
    });
    const out = await weeklyObservations({} as never, report);
    expect(out.aiObservations).toEqual(["Great adherence.", "Leg press climbed."]);
    expect(out.model).toBe("gemini-2.5-flash");
  });

  it("falls back to the deterministic voice on failure", async () => {
    mocks.generateContent.mockRejectedValueOnce(new Error("offline"));
    const out = await weeklyObservations({} as never, report);
    expect(out.model).toBe("deterministic");
    expect(out.aiObservations[0]).toBe("You completed all scheduled workouts this week.");
  });
});
