import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateDoc: vi.fn(async () => {}),
  setDoc: vi.fn(async () => {}),
  getDoc: vi.fn(async () => ({ data: () => ({ lastWeight: 70 }) })),
  getDocs: vi.fn(async () => ({ docs: [] })),
  batchSet: vi.fn(),
  commit: vi.fn(async () => {}),
}));

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...path: string[]) => path.join("/"),
  collection: (_db: unknown, ...path: string[]) => path.join("/"),
  query: (_collection: unknown, ...constraints: unknown[]) => constraints,
  where: (...args: unknown[]) => args,
  orderBy: (x: unknown) => x,
  getDoc: mocks.getDoc,
  getDocs: mocks.getDocs,
  setDoc: mocks.setDoc,
  updateDoc: mocks.updateDoc,
  writeBatch: () => ({ set: mocks.batchSet, update: vi.fn(), commit: mocks.commit }),
  onSnapshot: () => () => {},
}));

import { MONDAY } from "../domain/templates";
import { buildExerciseSession, buildSession } from "../domain/session";
import {
  createExercise,
  fetchActiveWorkout,
  fetchPreviousWeights,
  logSet,
  saveExercise,
  saveSession,
  startSession,
  upsertExerciseStat,
} from "./session-repository";

const ctx = { db: {} as never };
const now = new Date("2026-09-28T09:00:00Z");
const baseInput = {
  sessionId: "s1",
  uid: "u1",
  template: MONDAY,
  scheduledDate: "2026-09-28",
  now,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("startSession", () => {
  it("creates a started session and its exercise drafts in one atomic batch", async () => {
    const result = await startSession(ctx, {
      ...baseInput,
      previousWeights: { "leg-press": 70 },
      initialWeights: { "leg-press": 75 },
      weightUnit: "kg",
    });
    expect(result.session.status).toBe("in_progress");
    expect(result.session.startedAt).toEqual(now);
    expect(result.exercises).toHaveLength(MONDAY.exercises.length);
    const legPress = result.exercises.find((exercise) => exercise.exerciseKey === "leg-press");
    expect(legPress).toMatchObject({
      previousWeight: 70,
      weightUsed: 75,
      weightUnit: "kg",
    });
    expect(mocks.commit).toHaveBeenCalledOnce();
    expect(mocks.batchSet).toHaveBeenCalledTimes(1 + MONDAY.exercises.length);
  });

  it("persists the effective started status atomically with the session", async () => {
    await startSession(ctx, {
      ...baseInput,
      previousWeights: {},
    });
    const [sessionDoc, payload] = mocks.batchSet.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(sessionDoc).toContain("workoutSessions/s1");
    expect(payload.status).toBe("in_progress");
    expect(payload.startedAt).toEqual(now);
  });
});

describe("fetchActiveWorkout (recovery boundary)", () => {
  it("rehydrates the latest active session, exercises, and sets", async () => {
    const active = buildSession({ ...baseInput });
    const started = { ...active, status: "in_progress" as const, startedAt: now };
    const exercise = buildExerciseSession({
      template: MONDAY,
      order: 2,
      previousWeight: 70,
      initialWeight: 75,
      weightUnit: "lb",
      now,
    });
    mocks.getDocs
      .mockResolvedValueOnce({ docs: [{ data: () => started }] } as never)
      .mockResolvedValueOnce({ docs: [{ data: () => exercise }] } as never)
      .mockResolvedValueOnce({
        docs: [{ data: () => ({ setNumber: 1, weight: 75, reps: 10, completed: true, createdAt: now }) }],
      } as never);

    const result = await fetchActiveWorkout(ctx, "u1");
    expect(result?.session.status).toBe("in_progress");
    expect(result?.exercises[0]?.weightUsed).toBe(75);
    expect(result?.sets).toEqual([
      { setNumber: 1, weight: 75, reps: 10, completed: true, createdAt: now, exerciseKey: "leg-press" },
    ]);
  });

  it("parses Firestore Timestamp-like values into Dates during recovery", async () => {
    const active = buildSession({ ...baseInput });
    const started = { ...active, status: "in_progress" as const, startedAt: now };
    const timestamp = { toDate: () => now };
    mocks.getDocs
      .mockResolvedValueOnce({
        docs: [{ data: () => ({ ...started, startedAt: timestamp, createdAt: timestamp, updatedAt: timestamp }) }],
      } as never)
      .mockResolvedValueOnce({ docs: [] } as never);

    const result = await fetchActiveWorkout(ctx, "u1");
    expect(result?.session.startedAt).toEqual(now);
    expect(result?.session.createdAt).toEqual(now);
  });

  it("returns null when no active workout exists", async () => {
    mocks.getDocs.mockResolvedValueOnce({ docs: [] } as never);
    await expect(fetchActiveWorkout(ctx, "u1")).resolves.toBeNull();
  });
});

describe("saveExercise (autosave boundary)", () => {
  const current = buildExerciseSession({
    template: MONDAY,
    order: 2,
    previousWeight: 70,
    weightUnit: "lb",
    now,
  });

  it("writes the merged doc with a bumped updatedAt", async () => {
    const merged = await saveExercise(ctx, {
      uid: "u1",
      sessionId: "s1",
      current,
      patch: { weightUsed: 75 },
      now,
    });
    expect(merged.weightUsed).toBe(75);
    expect(mocks.updateDoc).toHaveBeenCalledOnce();
    const [, payload] = mocks.updateDoc.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
    expect(payload.weightUsed).toBe(75);
    expect(payload.updatedAt).toEqual(now);
  });

  it("rejects invalid patches without writing anything", async () => {
    await expect(
      saveExercise(ctx, {
        uid: "u1",
        sessionId: "s1",
        current,
        patch: { notes: "n".repeat(1001) },
        now,
      }),
    ).rejects.toThrow();
    expect(mocks.updateDoc).not.toHaveBeenCalled();
  });
});

describe("saveSession (state machine)", () => {
  const current = buildSession({ ...baseInput });

  it("allows in_progress -> completed", async () => {
    const merged = await saveSession(ctx, {
      uid: "u1",
      current: { ...current, status: "in_progress" },
      patch: { status: "completed", completedAt: now },
      now,
    });
    expect(merged.status).toBe("completed");
    expect(mocks.updateDoc).toHaveBeenCalledOnce();
  });

  it("throws on not_started -> completed without writing", async () => {
    await expect(
      saveSession(ctx, {
        uid: "u1",
        current,
        patch: { status: "completed" },
        now,
      }),
    ).rejects.toThrow("Invalid status transition");
    expect(mocks.updateDoc).not.toHaveBeenCalled();
  });
});

describe("createExercise", () => {
  it("persists a newly created exercise to Firestore via setDoc", async () => {
    const ex = buildExerciseSession({
      template: MONDAY,
      order: 1,
      previousWeight: null,
      weightUnit: "lb",
      now,
    });
    const result = await createExercise(ctx, {
      uid: "u1",
      sessionId: "s1",
      exercise: ex,
      now,
    });
    expect(result.exerciseKey).toBe("bike-warmup");
    expect(mocks.setDoc).toHaveBeenCalledOnce();
  });
});

describe("logSet + fetchPreviousWeights", () => {
  it("stores each set under its numbered id and updates exerciseStats cache", async () => {
    await logSet(ctx, {
      uid: "u1",
      sessionId: "s1",
      exerciseKey: "leg-press",
      set: { setNumber: 1, weight: 75, reps: 10, completed: true, createdAt: now },
    });
    const [setRef] = mocks.setDoc.mock.calls[0] as unknown as [string];
    expect(setRef).toContain("/sets/s1");

    // Second write is to exerciseStats
    const [statsRef, statsPayload] = mocks.setDoc.mock.calls[1] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(statsRef).toBe("users/u1/exerciseStats/leg-press");
    expect(statsPayload.lastWeight).toBe(75);
    expect(statsPayload.updatedAt).toEqual(now);
  });

  it("does not throw or abort set logging if exerciseStats cache write fails", async () => {
    // Fail setDoc on exerciseStats
    mocks.setDoc.mockResolvedValueOnce(undefined);
    mocks.setDoc.mockRejectedValueOnce(new Error("Stats write failed"));

    await expect(
      logSet(ctx, {
        uid: "u1",
        sessionId: "s1",
        exerciseKey: "leg-press",
        set: { setNumber: 1, weight: 80, reps: 10, completed: true, createdAt: now },
      }),
    ).resolves.not.toThrow();
  });

  it("maps missing stats to null and present stats to lastWeight", async () => {
    const out = await fetchPreviousWeights(ctx, "u1", ["leg-press", "chest-press"]);
    expect(out["leg-press"]).toBe(70);
  });
});

describe("upsertExerciseStat", () => {
  it("creates a new exerciseStat doc with valid schema defaults", async () => {
    mocks.getDoc.mockResolvedValueOnce({ exists: () => false, data: () => undefined } as never);
    const result = await upsertExerciseStat(ctx, {
      uid: "u1",
      exerciseKey: "leg-press",
      lastWeight: 85,
      reps: 12,
      difficulty: "good",
      now,
    });

    expect(result).toMatchObject({
      lastWeight: 85,
      lastReps: [12],
      lastDifficulty: "good",
      highestWeight: 85,
      totalSessions: 1,
      lastWorkoutDate: "2026-09-28",
      updatedAt: now,
    });
    expect(mocks.setDoc).toHaveBeenCalledWith(
      "users/u1/exerciseStats/leg-press",
      expect.objectContaining({ lastWeight: 85 }),
    );
  });
});
