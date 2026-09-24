// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildExerciseSession, buildSession } from "../domain/session";
import { MONDAY } from "../domain/templates";

const mocks = vi.hoisted(() => ({
  fetchPreviousWeights: vi.fn(async () => ({ "leg-press": 70 })),
  startSession: vi.fn(async () => ({ id: "sx", status: "not_started" })),
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
});

describe("useWorkoutSession + coach wiring", () => {
  const render = () =>
    renderHook(() =>
      useWorkoutSession({
        db: {} as never,
        uid: "u1",
        template: MONDAY,
        scheduledDate: "2026-09-28",
      }),
    );

  it("start computes one suggestion per resistance exercise and saves audit rows", async () => {
    mocks.fetchRecentDetails.mockResolvedValueOnce([recentDetail(70, [10, 10])]);
    const { result } = render();
    await act(async () => {
      await result.current.start();
    });
    // Monday has 4 resistance exercises
    expect(mocks.saveRecommendation).toHaveBeenCalledTimes(4);
    const legPress = result.current.recommendations["leg-press"];
    expect(legPress.recommendation).toMatchObject({
      action: "increase",
      previousWeight: 70,
      suggestedWeight: 75,
    });
  });

  it("blocks and records the safety reason on symptom history", async () => {
    const d = recentDetail(70, [10, 10]);
    mocks.fetchRecentDetails.mockResolvedValueOnce([
      { ...d, session: { ...d.session, dizzinessReported: true } },
    ]);
    const { result } = render();
    await act(async () => {
      await result.current.start();
    });
    const legPress = result.current.recommendations["leg-press"];
    expect(legPress.recommendation.blockedBySafety).toBe(true);
    expect(legPress.reason).toBe("Do not increase resistance based on this session.");
  });

  it("decide records the verdict against the audit row id", async () => {
    const { result } = render();
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
    const { result } = renderHook(() =>
      useWorkoutSession({
        db: {} as never,
        uid: "u1",
        template: MONDAY,
        scheduledDate: "2026-09-28",
        coachEnabled: false,
      }),
    );
    await act(async () => {
      await result.current.start();
    });
    expect(mocks.saveRecommendation).not.toHaveBeenCalled();
  });

  it("patchExercise still autosaves immediately", async () => {
    const { result } = render();
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
});
