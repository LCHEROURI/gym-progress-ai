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
import { defaultProfile, type Profile } from "../data/settings";

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

  it("recognizes user-defined extra exercises in intent context", async () => {
    const { result } = renderHook(() =>
      useCoachTurn({
        db,
        uid: "u1",
        app,
        extraExercises: [
          {
            key: "custom-biceps-curl",
            name: "Biceps Curl",
            targetSets: 2,
            targetRepsMin: 10,
            targetRepsMax: 10,
            tip: "",
          },
        ],
      }),
    );
    await waitFor(() => expect(result.current.historyLoading).toBe(false));

    await act(async () => {
      await result.current.send("what weight for biceps curl");
    });

    expect(mocks.askCoach).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          intent: "weightToday",
          exerciseKey: "custom-biceps-curl",
        }),
      }),
    );
  });
});

describe("useCoachTurn · add extra exercise flow", () => {
  it("completes full confirmation round-trip: request → confirm → saved", async () => {
    const onSaveProfile = vi.fn<(profile: Profile) => Promise<void>>(async () => undefined);
    const profile = defaultProfile();
    const { result } = renderHook(() =>
      useCoachTurn({ db, uid: "u1", app, profile, onSaveProfile }),
    );

    await waitFor(() => expect(result.current.historyLoading).toBe(false));

    // Turn 1: user requests adding biceps curls
    await act(async () => {
      await result.current.send("add biceps curls");
    });

    expect(result.current.messages).toEqual([
      { role: "user", text: "add biceps curls" },
      {
        role: "model",
        text: "I can add Biceps Curl (2 sets × 10 reps) to every workout. Would you like me to add it?",
      },
    ]);
    expect(onSaveProfile).not.toHaveBeenCalled();

    // Turn 2: user confirms with "yes"
    await act(async () => {
      await result.current.send("yes");
    });

    expect(onSaveProfile).toHaveBeenCalledOnce();
    const savedProfile = onSaveProfile.mock.calls[0][0];
    expect(savedProfile.extraExercises).toHaveLength(1);
    expect(savedProfile.extraExercises[0]).toMatchObject({
      name: "Biceps Curl",
      key: "custom-biceps-curl",
      targetSets: 2,
      targetRepsMin: 10,
      targetRepsMax: 10,
    });

    expect(result.current.messages).toEqual([
      { role: "user", text: "add biceps curls" },
      {
        role: "model",
        text: "I can add Biceps Curl (2 sets × 10 reps) to every workout. Would you like me to add it?",
      },
      { role: "user", text: "yes" },
      {
        role: "model",
        text: "Added Biceps Curl (2 sets × 10 reps) to your extra exercises. It will appear at the end of every workout.",
      },
    ]);
  });

  it("handles decline path on 'no' and cancels addition", async () => {
    const onSaveProfile = vi.fn<(profile: Profile) => Promise<void>>(async () => undefined);
    const profile = defaultProfile();
    const { result } = renderHook(() =>
      useCoachTurn({ db, uid: "u1", app, profile, onSaveProfile }),
    );

    await waitFor(() => expect(result.current.historyLoading).toBe(false));

    await act(async () => {
      await result.current.send("add biceps curls");
    });

    await act(async () => {
      await result.current.send("no");
    });

    expect(onSaveProfile).not.toHaveBeenCalled();
    expect(result.current.messages.at(-1)?.text).toBe("Okay, I won't add that exercise.");
  });

  it("drops pending addition quietly on subject change", async () => {
    const onSaveProfile = vi.fn<(profile: Profile) => Promise<void>>(async () => undefined);
    const profile = defaultProfile();
    const { result } = renderHook(() =>
      useCoachTurn({ db, uid: "u1", app, profile, onSaveProfile }),
    );

    await waitFor(() => expect(result.current.historyLoading).toBe(false));

    await act(async () => {
      await result.current.send("add 3 sets of lateral raises");
    });

    expect(result.current.messages.at(-1)?.text).toContain("Lateral Raises");

    // Subject change: asks about workouts instead of answering yes/no
    await act(async () => {
      await result.current.send("How many workouts did I complete this month?");
    });

    expect(onSaveProfile).not.toHaveBeenCalled();
    expect(mocks.askCoach).toHaveBeenCalledOnce();
    expect(result.current.messages.at(-1)?.text).toBe("You completed 1 workout this month.");
  });

  it("guards against duplicates when exercise already exists", async () => {
    const onSaveProfile = vi.fn<(profile: Profile) => Promise<void>>(async () => undefined);
    const profile = {
      ...defaultProfile(),
      extraExercises: [
        {
          key: "custom-biceps-curl",
          name: "Biceps Curl",
          targetSets: 2,
          targetRepsMin: 10,
          targetRepsMax: 10,
          tip: "",
        },
      ],
    };
    const { result } = renderHook(() =>
      useCoachTurn({ db, uid: "u1", app, profile, onSaveProfile }),
    );

    await waitFor(() => expect(result.current.historyLoading).toBe(false));

    await act(async () => {
      await result.current.send("add biceps curls");
    });

    expect(onSaveProfile).not.toHaveBeenCalled();
    expect(result.current.messages.at(-1)?.text).toBe(
      "Biceps Curl is already in your extra exercises.",
    );
  });

  it("enforces the 20-exercise maximum guard", async () => {
    const onSaveProfile = vi.fn<(profile: Profile) => Promise<void>>(async () => undefined);
    const twentyExtras = Array.from({ length: 20 }, (_, i) => ({
      key: `custom-exercise-${i + 1}`,
      name: `Exercise ${i + 1}`,
      targetSets: 2,
      targetRepsMin: 10,
      targetRepsMax: 10,
      tip: "",
    }));
    const profile = {
      ...defaultProfile(),
      extraExercises: twentyExtras,
    };
    const { result } = renderHook(() =>
      useCoachTurn({ db, uid: "u1", app, profile, onSaveProfile }),
    );

    await waitFor(() => expect(result.current.historyLoading).toBe(false));

    await act(async () => {
      await result.current.send("add lateral raises");
    });

    expect(onSaveProfile).not.toHaveBeenCalled();
    expect(result.current.messages.at(-1)?.text).toBe(
      "You already have 20 extra exercises, which is the maximum. Remove one in Settings before adding more.",
    );
  });

  it("clarifies unknown muscle group before confirming", async () => {
    const onSaveProfile = vi.fn<(profile: Profile) => Promise<void>>(async () => undefined);
    const profile = defaultProfile();
    const { result } = renderHook(() =>
      useCoachTurn({ db, uid: "u1", app, profile, onSaveProfile }),
    );

    await waitFor(() => expect(result.current.historyLoading).toBe(false));

    await act(async () => {
      await result.current.send("include chest work");
    });

    expect(result.current.messages.at(-1)?.text).toContain(
      "Which chest exercise would you like to add?",
    );

    await act(async () => {
      await result.current.send("incline dumbbell press 3 sets of 10");
    });

    expect(result.current.messages.at(-1)?.text).toBe(
      "I can add Incline Dumbbell Press (3 sets × 10 reps) to every workout. Would you like me to add it?",
    );

    await act(async () => {
      await result.current.send("do it");
    });

    expect(onSaveProfile).toHaveBeenCalledOnce();
    expect(onSaveProfile.mock.calls[0][0].extraExercises[0]).toMatchObject({
      name: "Incline Dumbbell Press",
      targetSets: 3,
      targetRepsMin: 10,
      targetRepsMax: 10,
    });
  });

  it("explains save failure plainly when persistence fails", async () => {
    const onSaveProfile = vi.fn<(profile: Profile) => Promise<void>>(async () => {
      throw new Error("network down");
    });
    const profile = defaultProfile();
    const { result } = renderHook(() =>
      useCoachTurn({ db, uid: "u1", app, profile, onSaveProfile }),
    );

    await waitFor(() => expect(result.current.historyLoading).toBe(false));

    await act(async () => {
      await result.current.send("add biceps curls");
    });

    await act(async () => {
      await result.current.send("yes");
    });

    expect(result.current.messages.at(-1)?.text).toBe(
      "Could not save Biceps Curl. Check your connection and try again.",
    );
  });
});
