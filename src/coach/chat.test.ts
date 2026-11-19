import { beforeEach, describe, expect, it, vi } from "vitest";

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
import { classifyQuestion } from "./intent";
import { COACH_SYSTEM, PROMPT_VERSION } from "../ai/prompts/coach-chat";
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

beforeEach(() => {
  mocks.sendMessage.mockClear();
  mocks.startChat.mockClear();
});

describe("askCoach", () => {
  it("returns the exact insufficient line without touching the model", async () => {
    const out = await askCoach({
      app: {} as never,
      question: "How many workouts?",
      context: emptyContext,
    });
    expect(out.text).toBe(INSUFFICIENT_HISTORY);
    expect(out.source).toBe("deterministic");
    expect(out.diagnostic).toBeNull();
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
    expect(out.text).toBe("You completed 1 workout this month.");
    expect(out.source).toBe("model");
    expect(out.diagnostic).toBeNull();
    expect(out.model).toBe("gemini-2.5-flash");
    expect(out.promptVersion).toBe("coach-chat-v3");
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
    expect(out.text).toBe(deterministicAnswer(context));
    expect(out.source).toBe("deterministic");
    expect(out.diagnostic?.category).toBe("network");
  });

  it("sanitizes malformed chat history before calling startChat", async () => {
    mocks.sendMessage.mockResolvedValueOnce({
      response: { text: () => "Keep steady at 70 lb." },
    });
    mocks.startChat.mockReturnValueOnce({ sendMessage: mocks.sendMessage });
    await askCoach({
      app: {} as never,
      question: "What next?",
      context,
      history: [
        { role: "model", text: "Orphan leading model reply" },
        { role: "user", text: "   " },
        { role: "user", text: "First question" },
        { role: "user", text: "Second question after failed turn" },
        { role: "model", text: "Answer to second question" },
        { role: "model", text: "Duplicate model turn" },
        { role: "user", text: "Dangling trailing user turn" },
      ],
    });
    expect(mocks.startChat).toHaveBeenCalledWith({
      history: [
        { role: "user", parts: [{ text: "Second question after failed turn" }] },
        { role: "model", parts: [{ text: "Answer to second question" }] },
      ],
    });
  });
});

const REPRO_QUESTION =
  "What kind of weights would you put me on in order to double my strength in two months?";

describe("askCoach · labeled fallback and safe diagnostics", () => {
  it("labels the fallback and reports a safe diagnostic when the model call fails", async () => {
    const raw =
      "429 RESOURCE_EXHAUSTED: quota exceeded for project gym-progress-ai-lcherouri";
    mocks.startChat.mockReturnValueOnce({
      sendMessage: vi.fn(async () => {
        throw new Error(raw);
      }),
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const out = await askCoach({ app: {} as never, question: "hi", context });
      expect(out.text).toBe(deterministicAnswer(context));
      expect(out.source).toBe("deterministic");
      expect(out.diagnostic?.category).toBe("quota");
      expect(out.diagnostic?.detail).toContain("quota");
      // The sanitized hint carries the refusal reason, but the project id and
      // anything credential-like must never reach the answer or the logs.
      expect(out.diagnostic?.hint).toBe("429 RESOURCE_EXHAUSTED: quota exceeded");
      expect(JSON.stringify(out)).not.toContain("gym-progress-ai-lcherouri");
      expect(JSON.stringify(warn.mock.calls)).not.toContain("gym-progress-ai-lcherouri");
      expect(warn).toHaveBeenCalledOnce();
      expect(warn.mock.calls[0]?.[0]).toBe("[coach] Gemini call failed");
      expect(warn.mock.calls[0]?.[1]).toEqual({
        category: "quota",
        detail: expect.any(String),
        code: "Error",
        hint: "429 RESOURCE_EXHAUSTED: quota exceeded",
        model: "gemini-2.5-flash",
        promptVersion: "coach-chat-v3",
      });
    } finally {
      warn.mockRestore();
    }
  });

  it("treats an empty model answer as an unavailable model and falls back deterministically", async () => {
    mocks.sendMessage.mockResolvedValueOnce({ response: { text: () => "" } });
    mocks.startChat.mockReturnValueOnce({ sendMessage: mocks.sendMessage });
    const out = await askCoach({ app: {} as never, question: "hi", context });
    expect(out.text).toBe(deterministicAnswer(context));
    expect(out.source).toBe("deterministic");
    expect(out.diagnostic?.category).toBe("model");
  });

  it("flags App Check as the likely cause when it is inactive and the request is refused", async () => {
    mocks.startChat.mockReturnValueOnce({
      sendMessage: vi.fn(async () => {
        throw new Error("403 PERMISSION_DENIED");
      }),
    });
    // In the test environment no site key is configured, so App Check is
    // "disabled" — a refused request with no token is expected to blame that.
    const out = await askCoach({ app: {} as never, question: "hi", context });
    expect(out.source).toBe("deterministic");
    expect(out.diagnostic?.category).toBe("app-check");
  });

  it("surfaces the provider error code when the refusal matches no known category", async () => {
    mocks.startChat.mockReturnValueOnce({
      sendMessage: vi.fn(async () => {
        const err = new Error("Request failed for an unrecognized reason");
        (err as { code?: string }).code = "ai/request-error";
        throw err;
      }),
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const out = await askCoach({ app: {} as never, question: "hi", context });
      expect(out.source).toBe("deterministic");
      expect(out.diagnostic?.category).toBe("unknown");
      expect(out.diagnostic?.detail).toBe("The AI service refused the request.");
      expect(out.diagnostic?.code).toBe("ai/request-error");
      expect(out.diagnostic?.hint).toBe("Request failed for an unrecognized reason");
      expect(warn.mock.calls[0]?.[1]).toMatchObject({ code: "ai/request-error" });
    } finally {
      warn.mockRestore();
    }
  });

  it("drops the hint when the error message contains credential-like text", async () => {
    mocks.startChat.mockReturnValueOnce({
      sendMessage: vi.fn(async () => {
        throw new Error("Request failed: API key AIzaSyABC123 rejected");
      }),
    });
    const out = await askCoach({ app: {} as never, question: "hi", context });
    expect(out.source).toBe("deterministic");
    expect(out.diagnostic?.hint).toBeUndefined();
    expect(out.diagnostic?.code).toBe("Error");
    expect(JSON.stringify(out)).not.toContain("AIzaSyABC123");
  });
});

describe("askCoach · general-intent facts (repro: doubling strength)", () => {
  it("feeds open-ended strength questions the per-exercise facts", async () => {
    const classified = classifyQuestion({
      question: REPRO_QUESTION,
      knownExercises: [],
    });
    expect(classified.intent).toBe("general");

    const reproContext = buildCoachContext({
      classified,
      sessions: [
        { id: "s1", scheduledDate: "2026-09-07", status: "completed" },
        { id: "s2", scheduledDate: "2026-09-09", status: "completed" },
        { id: "s3", scheduledDate: "2026-09-11", status: "completed" },
      ],
      exercises: [
        {
          sessionId: "s1",
          scheduledDate: "2026-09-07",
          exerciseKey: "leg-press",
          exerciseName: "Leg Press",
          completed: true,
          weightUsed: 70,
          difficulty: "good",
          durationMinutes: null,
        },
        {
          sessionId: "s2",
          scheduledDate: "2026-09-09",
          exerciseKey: "leg-press",
          exerciseName: "Leg Press",
          completed: true,
          weightUsed: 72,
          difficulty: "good",
          durationMinutes: null,
        },
        {
          sessionId: "s3",
          scheduledDate: "2026-09-11",
          exerciseKey: "leg-press",
          exerciseName: "Leg Press",
          completed: true,
          weightUsed: 75,
          difficulty: "good",
          durationMinutes: null,
        },
      ],
      today: new Date("2026-09-27T12:00:00Z"),
    });
    expect(reproContext.insufficient).toBe(false);

    mocks.sendMessage.mockResolvedValueOnce({
      response: { text: () => "Based on your Leg Press records, doubling in two months is not realistic. Keep adding 5 lb when sets feel easy." },
    });
    mocks.startChat.mockReturnValueOnce({ sendMessage: mocks.sendMessage });
    const out = await askCoach({
      app: {} as never,
      question: REPRO_QUESTION,
      context: reproContext,
    });
    expect(out.source).toBe("model");

    const prompt = mocks.sendMessage.mock.calls[0][0] as string;
    expect(prompt).toContain('"startingWeight": 70');
    expect(prompt).toContain('"currentWeight": 75');
    expect(prompt).toContain('"highestWeight": 75');
    expect(prompt).toContain('"recentTrend": "up"');
    expect(prompt).toContain(REPRO_QUESTION);
  });
});

describe("coach-chat prompt contract", () => {
  it("is versioned and explains the three progression notions plus honest goal-setting", async () => {
    expect(PROMPT_VERSION).toBe("coach-chat-v3");
    expect(COACH_SYSTEM).toContain("overall progression");
    expect(COACH_SYSTEM).toContain("recent trend");
    expect(COACH_SYSTEM).toContain("historical maximum");
    expect(COACH_SYSTEM).toContain("not a realistic target");
  });
});
