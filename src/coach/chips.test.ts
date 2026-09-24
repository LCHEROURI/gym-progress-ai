import { describe, expect, it } from "vitest";
import type { ExerciseFact, SessionFact } from "../progress/stats";
import { DEFAULT_CHIPS, lastEffortFeedback, suggestQuickChips } from "./chips";

const session = (
  id: string,
  scheduledDate: string,
  status: SessionFact["status"] = "completed",
): SessionFact => ({ id, scheduledDate, status });

const fact = (over: Partial<ExerciseFact>): ExerciseFact => ({
  sessionId: "s1",
  scheduledDate: "2026-09-21",
  exerciseKey: "leg-press",
  exerciseName: "Leg Press",
  completed: true,
  weightUsed: 70,
  difficulty: "good",
  durationMinutes: null,
  ...over,
});

const s3 = session("s3", "2026-09-25");

describe("lastEffortFeedback", () => {
  it("rates the latest completed session whatever the array order", () => {
    const sessions = [session("s1", "2026-09-21"), session("s2", "2026-09-23"), s3];
    expect(
      lastEffortFeedback({
        sessions,
        exercises: [
          fact({ sessionId: "s1", difficulty: "easy" }),
          fact({ sessionId: "s3", scheduledDate: "2026-09-25", difficulty: "good" }),
        ],
      }),
    ).toBe("good");
  });

  it("is hard when anything felt hard", () => {
    expect(
      lastEffortFeedback({
        sessions: [s3],
        exercises: [
          fact({ sessionId: "s3", scheduledDate: "2026-09-25", difficulty: "easy" }),
          fact({
            sessionId: "s3",
            scheduledDate: "2026-09-25",
            exerciseKey: "chest-press",
            difficulty: "hard",
          }),
        ],
      }),
    ).toBe("hard");
  });

  it("is easy only when every rating was easy", () => {
    const allEasy = [
      fact({ sessionId: "s3", scheduledDate: "2026-09-25", difficulty: "easy" }),
      fact({
        sessionId: "s3",
        scheduledDate: "2026-09-25",
        exerciseKey: "chest-press",
        difficulty: "easy",
      }),
    ];
    expect(lastEffortFeedback({ sessions: [s3], exercises: allEasy })).toBe("easy");
    expect(
      lastEffortFeedback({
        sessions: [s3],
        exercises: [
          ...allEasy,
          fact({
            sessionId: "s3",
            scheduledDate: "2026-09-25",
            exerciseKey: "bike",
            difficulty: "good",
          }),
        ],
      }),
    ).toBe("good");
  });

  it("is null with no completed session or no ratings", () => {
    expect(lastEffortFeedback({ sessions: [], exercises: [] })).toBeNull();
    expect(
      lastEffortFeedback({
        sessions: [session("s9", "2026-09-25", "in_progress")],
        exercises: [],
      }),
    ).toBeNull();
    expect(
      lastEffortFeedback({
        sessions: [s3],
        exercises: [
          fact({ sessionId: "s3", scheduledDate: "2026-09-25", difficulty: null }),
        ],
      }),
    ).toBeNull();
  });
});

describe("suggestQuickChips", () => {
  it("keeps the brief's defaults without feedback", () => {
    expect(suggestQuickChips(null)).toEqual(DEFAULT_CHIPS);
    expect(DEFAULT_CHIPS).toHaveLength(7);
  });

  it("leads with lighter-workout suggestions after a hard session", () => {
    const chips = suggestQuickChips("hard");
    expect(chips).toHaveLength(5);
    expect(chips.map((c) => c.label)).toEqual([
      "Plan a lighter next workout",
      "What should I keep steady?",
      "What weight should I use today?",
      "Which exercise has stalled?",
      "What should I focus on next week?",
    ]);
  });

  it("leads with progression suggestions after an easy session", () => {
    expect(suggestQuickChips("easy")[0].label).toBe(
      "What should I increase next workout?",
    );
  });

  it("leads with hold-steady suggestions after a good session", () => {
    expect(suggestQuickChips("good")[0].label).toBe("Repeat next workout as-is?");
  });
});
