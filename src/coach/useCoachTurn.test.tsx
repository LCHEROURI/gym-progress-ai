// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchProgressFacts: vi.fn(async () => ({
    sessions: [{ id: "s1", scheduledDate: "2026-09-07", status: "completed" as const }],
    exercises: [],
  })),
  askCoach: vi.fn(async (input: {
    context: { insufficient: boolean };
  }) => {
    void input;
    return "You completed 1 workout this month.";
  }),
}));

vi.mock("../data/progress", () => ({ fetchProgressFacts: mocks.fetchProgressFacts }));
vi.mock("./chat", () => ({
  askCoach: mocks.askCoach,
  INSUFFICIENT_HISTORY: "I don't have enough workout history yet.",
}));

import { useCoachTurn } from "./useCoachTurn";

const db = {} as never;
const app = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchProgressFacts.mockResolvedValue({
    sessions: [{ id: "s1", scheduledDate: "2026-09-07", status: "completed" }],
    exercises: [],
  } as never);
  mocks.askCoach.mockResolvedValue("You completed 1 workout this month.");
});

describe("useCoachTurn · complete grounded turn", () => {
  it("loads history once, then answers with context built from real facts", async () => {
    const { result } = renderHook(() =>
      useCoachTurn({ db, uid: "u1", app, today: new Date("2026-09-27T12:00:00Z") }),
    );

    await waitFor(() => expect(result.current.historyLoading).toBe(false));
    expect(result.current.facts?.sessions).toHaveLength(1);

    await act(async () => {
      await result.current.send("How many workouts did I complete this month?");
    });

    expect(mocks.fetchProgressFacts).toHaveBeenCalledOnce();
    expect(mocks.askCoach).toHaveBeenCalledWith(
      expect.objectContaining({
        app,
        question: "How many workouts did I complete this month?",
        context: expect.objectContaining({
          intent: "workoutsCount",
          facts: expect.objectContaining({ totalWorkouts: 1 }),
        }),
        history: [],
      }),
    );
    expect(result.current.messages).toEqual([
      { role: "user", text: "How many workouts did I complete this month?" },
      { role: "model", text: "You completed 1 workout this month." },
    ]);
  });

  it("shares the pending history request when a question arrives before facts", async () => {
    let resolveFacts!: (value: { sessions: never[]; exercises: never[] }) => void;
    mocks.fetchProgressFacts.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFacts = resolve;
      }) as never,
    );
    const { result } = renderHook(() => useCoachTurn({ db, uid: "u1", app }));

    let turnPromise: Promise<void> | undefined;
    await act(async () => {
      turnPromise = result.current.send("How many workouts did I complete this month?");
    });
    expect(mocks.askCoach).not.toHaveBeenCalled();

    await act(async () => {
      resolveFacts({ sessions: [], exercises: [] });
      await turnPromise;
    });

    await waitFor(() => expect(mocks.askCoach).toHaveBeenCalledOnce());
    expect(mocks.fetchProgressFacts).toHaveBeenCalledOnce();
    expect(mocks.askCoach.mock.calls[0]?.[0].context.insufficient).toBe(true);
  });

  it("shows history-specific recovery when the history needed for a turn cannot load", async () => {
    mocks.fetchProgressFacts.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useCoachTurn({ db, uid: "u1", app }));

    await act(async () => {
      await result.current.send("How many workouts did I complete this month?");
    });

    expect(result.current.error).toContain("load the facts");
    expect(result.current.messages).toEqual([
      { role: "user", text: "How many workouts did I complete this month?" },
    ]);
    expect(mocks.askCoach).not.toHaveBeenCalled();
  });

  it("shows retryable history failure instead of answering from a fake empty history", async () => {
    mocks.fetchProgressFacts
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        sessions: [{ id: "s2", scheduledDate: "2026-09-08", status: "completed" }],
        exercises: [],
      } as never);
    const { result } = renderHook(() => useCoachTurn({ db, uid: "u1", app }));

    await waitFor(() => expect(result.current.historyLoading).toBe(false));
    expect(result.current.historyError).toContain("Check your connection");
    expect(result.current.facts).toBeNull();

    await act(async () => {
      await result.current.retryHistory();
    });
    expect(result.current.historyError).toBeNull();
    expect(result.current.facts?.sessions[0]?.id).toBe("s2");
    expect(mocks.fetchProgressFacts).toHaveBeenCalledTimes(2);
  });

  it("surfaces an unexpected answer-pipeline failure without inventing a reply", async () => {
    mocks.askCoach.mockRejectedValueOnce(new Error("unexpected pipeline failure"));
    const { result } = renderHook(() => useCoachTurn({ db, uid: "u1", app }));
    await waitFor(() => expect(result.current.historyLoading).toBe(false));

    await act(async () => {
      await result.current.send("How many workouts did I complete this month?");
    });

    expect(result.current.error).toBe("Could not reach the coach. Try again.");
    expect(result.current.messages).toEqual([
      { role: "user", text: "How many workouts did I complete this month?" },
    ]);
  });

  it("uses the answer pipeline's deterministic facts when its model fallback resolves", async () => {
    mocks.askCoach.mockResolvedValueOnce("You completed 1 workout this month (1 in total).");
    const { result } = renderHook(() => useCoachTurn({ db, uid: "u1", app }));
    await waitFor(() => expect(result.current.historyLoading).toBe(false));

    await act(async () => {
      await result.current.send("How many workouts did I complete this month?");
    });

    expect(result.current.error).toBeNull();
    expect(result.current.messages.at(-1)?.text).toBe(
      "You completed 1 workout this month (1 in total).",
    );
  });
});
