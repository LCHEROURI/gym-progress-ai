// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
}));
vi.mock("../data/session-repository", () => mocks);

import { MONDAY } from "../domain/templates";
import { useWorkoutSession } from "./useWorkoutSession";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useWorkoutSession", () => {
  it("start builds the session and all template exercises", async () => {
    const { result } = renderHook(() =>
      useWorkoutSession({
        db: {} as never,
        uid: "u1",
        template: MONDAY,
        scheduledDate: "2026-09-28",
      }),
    );
    expect(result.current.phase).toBe("today");
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.phase).toBe("active");
    expect(result.current.exercises).toHaveLength(MONDAY.exercises.length);
    expect(mocks.startSession).toHaveBeenCalledOnce();
  });

  it("patchExercise autosaves immediately and updates state", async () => {
    const { result } = renderHook(() =>
      useWorkoutSession({
        db: {} as never,
        uid: "u1",
        template: MONDAY,
        scheduledDate: "2026-09-28",
      }),
    );
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await result.current.patchExercise("leg-press", { weightUsed: 75 });
    });
    await waitFor(() => {
      expect(mocks.saveExercise).toHaveBeenCalledOnce();
    });
    const legPress = result.current.exercises.find((e) => e.exerciseKey === "leg-press");
    expect(legPress?.weightUsed).toBe(75);
  });
});
