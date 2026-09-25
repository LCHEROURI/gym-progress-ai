// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildExerciseSession, buildSession } from "../domain/session";
import { MONDAY } from "../domain/templates";

const mocks = vi.hoisted(() => ({
  fetchActiveWorkout: vi.fn(async () => null),
  fetchPreviousWeights: vi.fn(async () => ({ "leg-press": 70 })),
  startSession: vi.fn(async (_ctx: unknown, input: { template: typeof MONDAY; previousWeights: Record<string, number | null>; initialWeights?: Record<string, number>; weightUnit?: "lb" | "kg" }) => ({
    session: { id: "sx", status: "in_progress", startedAt: new Date() },
    exercises: input.template.exercises.map((exercise) =>
      buildExerciseSession({
        template: input.template,
        order: exercise.order,
        previousWeight: input.previousWeights[exercise.key] ?? null,
        initialWeight: input.initialWeights?.[exercise.key],
        weightUnit: exercise.kind === "resistance" ? input.weightUnit ?? "lb" : null,
      }),
    ),
  })),
  saveExercise: vi.fn(
    async (_c: unknown, input: { current: Record<string, unknown>; patch: Record<string, unknown> }) => ({
      ...input.current,
      ...input.patch,
    }),
  ),
  saveSession: vi.fn(
    async (_c: unknown, input: { current: Record<string, unknown>; patch: Record<string, unknown> }) => ({
      ...input.current,
      ...input.patch,
    }),
  ),
  logSet: vi.fn(async () => {}),
  fetchRecentDetails: vi.fn(async () => [] as unknown[]),
  saveRecommendation: vi.fn(async () => {}),
  recordDecision: vi.fn(async () => {}),
}));
vi.mock("../data/session-repository", () => mocks);
vi.mock("../data/history", () => ({ fetchRecentDetails: mocks.fetchRecentDetails }));
vi.mock("../coach/recommendations", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  saveRecommendation: mocks.saveRecommendation,
  recordDecision: mocks.recordDecision,
}));

import { useWorkoutSession } from "./useWorkoutSession";

const db = {} as never;
const t0 = new Date("2026-09-25T09:00:00Z");

function recentDetail(weight: number, reps: number[]) {
  const session = buildSession({
    sessionId: "old1", uid: "u1", template: MONDAY, scheduledDate: "2026-09-25", now: t0,
  });
  const exercises = MONDAY.exercises.map((t) => ({
    ...buildExerciseSession({ template: MONDAY, order: t.order, previousWeight: null, weightUnit: "lb", now: t0 }),
    completed: true,
    weightUsed: t.kind === "resistance" ? weight : null,
  }));
  const sets = reps.map((r, i) => ({
    exerciseKey: "leg-press", setNumber: i + 1, weight, reps: r, completed: true, createdAt: t0,
  }));
  return { session, exercises, sets };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchActiveWorkout.mockReset().mockResolvedValue(null);
  mocks.fetchPreviousWeights.mockReset().mockResolvedValue({ "leg-press": 70 });
  mocks.fetchRecentDetails.mockReset().mockResolvedValue([]);
  mocks.startSession.mockClear();
  mocks.saveRecommendation.mockReset().mockResolvedValue(undefined);
});

describe("useWorkoutSession + coach wiring", () => {
  const render = (coachEnabled?: boolean) =>
    renderHook(() =>
      useWorkoutSession({
        db,
        uid: "u1",
        template: MONDAY,
        scheduledDate: "2026-09-28",
        coachEnabled,
      }),
    );

  const settleInitialRestore = async () => {
    await act(async () => {
      const request = mocks.fetchActiveWorkout.mock.results.at(-1)?.value as Promise<unknown>;
      try {
        await request;
      } catch {
        // A failed lookup remains visible as a retryable recovery error.
      }
    });
  };

  const waitForActivePhase = async (result: ReturnType<typeof render>["result"]) =>
    waitFor(() => expect(result.current.phase).toBe("active"));

  it("restores persisted in-progress session details before offering a new start", async () => {
    const active = {
      session: { id: "resume-1", status: "in_progress", startedAt: t0 },
      exercises: [
        buildExerciseSession({
          template: MONDAY,
          order: 2,
          previousWeight: 70,
          initialWeight: 75,
          weightUnit: "lb",
          now: t0,
        }),
      ],
      sets: [{ exerciseKey: "leg-press", setNumber: 1, weight: 75, reps: 8, completed: true, createdAt: t0 }],
    };
    mocks.fetchActiveWorkout.mockResolvedValueOnce(active as never);
    const { result } = render();
    await waitForActivePhase(result);
    expect(result.current.session?.id).toBe("resume-1");
    expect(result.current.exercises[0]?.weightUsed).toBe(75);
    expect(result.current.sets).toHaveLength(1);
    expect(mocks.startSession).not.toHaveBeenCalled();
  });

  it("blocks a new session until failed recovery is retried successfully", async () => {
    mocks.fetchActiveWorkout
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(null);
    const { result } = render();
    await settleInitialRestore();
    expect(result.current.error).toContain("Retry before starting");
    expect(result.current.phase).toBe("restoring");
    await act(async () => {
      await result.current.start();
    });
    expect(mocks.startSession).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.retryRestore();
    });
    expect(result.current.phase).toBe("today");
    await act(async () => {
      await result.current.start();
    });
    expect(mocks.startSession).toHaveBeenCalledOnce();
  });

  it("start computes one suggestion per resistance exercise and saves audit rows", async () => {
    mocks.fetchRecentDetails.mockResolvedValueOnce([recentDetail(70, [10, 10])]);
    const { result } = render();
    await settleInitialRestore();
    expect(result.current.phase).toBe("today");
    let startPromise!: Promise<void>;
    await act(async () => {
      startPromise = result.current.start();
    });
    await waitFor(() => expect(mocks.fetchPreviousWeights).toHaveBeenCalledOnce());
    await waitFor(() => expect(mocks.startSession).toHaveBeenCalledOnce());
    await act(async () => {
      await startPromise;
    });
    // Monday has 4 resistance exercises
    expect(mocks.saveRecommendation).toHaveBeenCalledTimes(4);
    const legPress = result.current.recommendations["leg-press"];
    expect(legPress.recommendation).toMatchObject({
      action: "increase",
      previousWeight: 70,
      suggestedWeight: 75,
    });
    expect(result.current.phase).toBe("active");
    expect(result.current.session?.status).toBe("in_progress");
  });

  it("blocks and records the safety reason on symptom history", async () => {
    const d = recentDetail(70, [10, 10]);
    mocks.fetchRecentDetails.mockResolvedValueOnce([
      { ...d, session: { ...d.session, dizzinessReported: true } },
    ]);
    const { result } = render();
    await settleInitialRestore();
    expect(result.current.phase).toBe("today");
    await act(async () => {
      await result.current.start();
    });
    const legPress = result.current.recommendations["leg-press"];
    expect(legPress.recommendation.blockedBySafety).toBe(true);
    expect(legPress.reason).toBe("Do not increase resistance based on this session.");
  });

  it("decide records the verdict against the audit row id", async () => {
    const { result } = render();
    await settleInitialRestore();
    expect(result.current.phase).toBe("today");
    await act(async () => {
      await result.current.start();
    });
    const id = result.current.recommendations["leg-press"].id;
    await act(async () => {
      await result.current.decide("leg-press", { accepted: true, finalWeightChosen: 75 });
    });
    await waitFor(() => {
      expect(mocks.recordDecision).toHaveBeenCalledWith(
        { db: {} },
        "u1",
        id,
        { accepted: true, finalWeightChosen: 75 },
      );
    });
  });

  it("skips coach suggestions when the AI coach is off", async () => {
    const { result } = render(false);
    await settleInitialRestore();
    expect(result.current.phase).toBe("today");
    await act(async () => {
      await result.current.start();
    });
    expect(mocks.saveRecommendation).not.toHaveBeenCalled();
  });

  it("keeps the persisted workout active when an optional recommendation write fails", async () => {
    mocks.saveRecommendation.mockRejectedValueOnce(new Error("offline"));
    const { result } = render();
    await settleInitialRestore();
    expect(result.current.phase).toBe("today");
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.phase).toBe("active");
    expect(result.current.session?.status).toBe("in_progress");
    expect(result.current.exercises).toHaveLength(MONDAY.exercises.length);
    expect(result.current.error).toContain("suggestions could not be saved");
  });

  it("starts with no previous weights when the derived stats lookup is unavailable", async () => {
    mocks.fetchPreviousWeights.mockRejectedValueOnce(new Error("offline"));
    const { result } = render();
    await settleInitialRestore();
    expect(result.current.phase).toBe("today");
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.phase).toBe("active");
    expect(
      result.current.exercises.find((exercise) => exercise.exerciseKey === "leg-press")?.weightUsed,
    ).toBeNull();
  });

  it("patchExercise still autosaves immediately", async () => {
    const { result } = render();
    await settleInitialRestore();
    expect(result.current.phase).toBe("today");
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await result.current.patchExercise("leg-press", { weightUsed: 75 });
    });
    await waitFor(() => {
      expect(mocks.saveExercise).toHaveBeenCalledOnce();
    });
  });

  it("start seeds today's weight from tapped picks (LAST weight untouched)", async () => {
    const { result } = render();
    await settleInitialRestore();
    expect(result.current.phase).toBe("today");
    await act(async () => {
      await result.current.start({ "leg-press": 75 });
    });
    const legPress = result.current.exercises.find(
      (e) => e.exerciseKey === "leg-press",
    )!;
    expect(legPress.weightUsed).toBe(75);
    expect(legPress.previousWeight).toBe(70);
    const chestPress = result.current.exercises.find(
      (e) => e.exerciseKey === "chest-press",
    )!;
    // No pick, no history — never fabricate a weight.
    expect(chestPress.weightUsed).toBeNull();
  });
});
