import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildExerciseSession, buildSession } from "../domain/session";
import { MONDAY } from "../domain/templates";

const now = new Date("2026-09-28T09:00:00Z");
const session = buildSession({
  sessionId: "s1", uid: "u1", template: MONDAY, scheduledDate: "2026-09-28", now,
});
const exercises = MONDAY.exercises.map((t) =>
  buildExerciseSession({ template: MONDAY, order: t.order, previousWeight: 70, weightUnit: "lb", now }),
);

const mocks = vi.hoisted(() => ({
  getDocs: vi.fn(async () => ({ docs: [] })),
}));

vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, ...path: string[]) => path.join("/"),
  query: (x: unknown) => x,
  orderBy: (x: unknown) => x,
  limit: (x: unknown) => x,
  getDocs: mocks.getDocs,
}));

import { fetchProgressFacts } from "./progress";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchProgressFacts", () => {
  it("flattens sessions and exercises into dated facts", async () => {
    mocks.getDocs
      .mockResolvedValueOnce({ docs: [{ data: () => session }] } as never)
      .mockResolvedValueOnce({ docs: exercises.map((e) => ({ data: () => e })) } as never);
    const facts = await fetchProgressFacts({ db: {} as never }, "u1");
    expect(facts.sessions).toEqual([
      { id: "s1", scheduledDate: "2026-09-28", status: "not_started" },
    ]);
    expect(facts.exercises).toHaveLength(7);
    expect(facts.exercises[1]).toMatchObject({
      exerciseKey: "leg-press",
      weightUsed: 70,
      scheduledDate: "2026-09-28",
    });
  });
});
