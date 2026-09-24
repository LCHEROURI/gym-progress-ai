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
  query: (x: unknown) => x,
  where: (...args: unknown[]) => args,
  orderBy: (x: unknown) => x,
  limit: (x: unknown) => x,
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
  fetchPreviousWeights,
  logSet,
  saveExercise,
  saveSession,
  startSession,
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
  it("creates the session and one exercise per template entry in a single batch", async () => {
    await startSession(ctx, {
      ...baseInput,
      previousWeights: { "leg-press": 70 },
    });
    expect(mocks.commit).toHaveBeenCalledOnce();
    expect(mocks.batchSet).toHaveBeenCalledTimes(1 + MONDAY.exercises.length);
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

describe("logSet + fetchPreviousWeights", () => {
  it("stores each set under its numbered id", async () => {
    await logSet(ctx, {
      uid: "u1",
      sessionId: "s1",
      exerciseKey: "leg-press",
      set: { setNumber: 1, weight: 75, reps: 10, completed: true, createdAt: now },
    });
    const [ref] = mocks.setDoc.mock.calls[0] as unknown as [string];
    expect(ref).toContain("/sets/s1");
  });

  it("maps missing stats to null and present stats to lastWeight", async () => {
    const out = await fetchPreviousWeights(ctx, "u1", ["leg-press", "chest-press"]);
    expect(out["leg-press"]).toBe(70);
  });
});
