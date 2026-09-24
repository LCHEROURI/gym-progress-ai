import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildExerciseSession, buildSession } from "../domain/session";
import { MONDAY } from "../domain/templates";

const now = new Date("2026-09-28T09:00:00Z");
const session = buildSession({
  sessionId: "s1", uid: "u1", template: MONDAY, scheduledDate: "2026-09-28", now,
});
const exercises = MONDAY.exercises.map((t, i) => ({
  ...buildExerciseSession({ template: MONDAY, order: t.order, previousWeight: null, weightUnit: "lb", now }),
  completed: i < 5,
}));

const mocks = vi.hoisted(() => ({
  getDoc: vi.fn(async () => ({ data: () => session })),
  getDocs: vi.fn(async () => ({ docs: [] })),
}));

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...path: string[]) => path.join("/"),
  collection: (_db: unknown, ...path: string[]) => path.join("/"),
  query: (x: unknown) => x,
  orderBy: (x: unknown) => x,
  limit: (x: unknown) => x,
  getDoc: mocks.getDoc,
  getDocs: mocks.getDocs,
}));

import { fetchHistory, fetchHistoryDetail } from "./history";

const ctx = { db: {} as never };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchHistory", () => {
  it("lists sessions with completion counts", async () => {
    mocks.getDocs
      .mockResolvedValueOnce({ docs: [{ data: () => session }] } as never)
      .mockResolvedValueOnce({ docs: exercises.map((e) => ({ data: () => e })) } as never);
    const rows = await fetchHistory(ctx, "u1");
    expect(rows).toHaveLength(1);
    expect(rows[0].scheduledDate).toBe("2026-09-28");
    expect([rows[0].exercisesDone, rows[0].exercisesTotal]).toEqual([5, 7]);
    expect(rows[0].status).toBe("not_started");
  });
});

describe("fetchHistoryDetail", () => {
  it("returns session, exercises, and sets grouped by exercise", async () => {
    mocks.getDoc.mockResolvedValueOnce({ data: () => session } as never);
    mocks.getDocs
      .mockResolvedValueOnce({ docs: exercises.map((e) => ({ data: () => e })) } as never)
      .mockResolvedValueOnce({
        docs: [{ data: () => ({ setNumber: 1, weight: 70, reps: 10, completed: true, createdAt: now }) }],
      } as never)
      .mockResolvedValueOnce({ docs: [] } as never)
      .mockResolvedValueOnce({ docs: [] } as never)
      .mockResolvedValueOnce({ docs: [] } as never)
      .mockResolvedValueOnce({ docs: [] } as never)
      .mockResolvedValueOnce({ docs: [] } as never)
      .mockResolvedValueOnce({ docs: [] } as never);
    const detail = await fetchHistoryDetail(ctx, "u1", "s1");
    expect(detail.exercises).toHaveLength(7);
    expect(detail.sets).toEqual([
      { setNumber: 1, weight: 70, reps: 10, completed: true, createdAt: now, exerciseKey: "bike-warmup" },
    ]);
  });
});
