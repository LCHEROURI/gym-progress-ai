import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  startChat: vi.fn(),
}));

vi.mock("firebase/ai", () => ({
  GoogleAIBackend: class {},
  getAI: () => ({}),
  getGenerativeModel: () => ({ startChat: mocks.startChat }),
}));

import { buildCoachContext } from "./context";
import { INSUFFICIENT_HISTORY, askCoach, deterministicAnswer } from "./chat";

const context = buildCoachContext({
  classified: { intent: "workoutsCount", exerciseKey: null },
  sessions: [{ id: "s1", scheduledDate: "2026-09-07", status: "completed" }],
  exercises: [],
  today: new Date("2026-09-27T12:00:00Z"),
});

const emptyContext = buildCoachContext({
  classified: { intent: "workoutsCount", exerciseKey: null },
  sessions: [],
  exercises: [],
  today: new Date("2026-09-27T12:00:00Z"),
});

describe("askCoach", () => {
  it("returns the exact insufficient line without touching the model", async () => {
    mocks.startChat.mockClear();
    const out = await askCoach({
      app: {} as never,
      question: "How many workouts?",
      context: emptyContext,
    });
    expect(out).toBe(INSUFFICIENT_HISTORY);
    expect(mocks.startChat).not.toHaveBeenCalled();
  });

  it("sends only computed facts and returns the model's answer", async () => {
    mocks.sendMessage.mockResolvedValueOnce({
      response: { text: () => "You completed 1 workout this month." },
    });
    mocks.startChat.mockReturnValueOnce({ sendMessage: mocks.sendMessage });
    const out = await askCoach({
      app: {} as never,
      question: "How many workouts did I complete this month?",
      context,
    });
    expect(out).toBe("You completed 1 workout this month.");
    const prompt = mocks.sendMessage.mock.calls[0][0] as string;
    expect(prompt).toContain('"totalWorkouts": 1');
    expect(prompt).toContain("Question: How many workouts");
  });

  it("falls back to deterministic lines when the model fails", async () => {
    mocks.startChat.mockReturnValueOnce({
      sendMessage: vi.fn(async () => {
        throw new Error("offline");
      }),
    });
    const out = await askCoach({ app: {} as never, question: "hi", context });
    expect(out).toBe(deterministicAnswer(context));
  });
});
