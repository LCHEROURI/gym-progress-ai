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

/**
 * Regression: fetchProgressFacts parsed documents straight into schemas that
 * declare z.date(), so it threw on every real Timestamp and the Progress
 * screen showed "Could not load your progress" for any account with a saved
 * workout. The fixtures below model the wire format, not buildSession's
 * already-plain Dates — which is why the original suite stayed green.
 */
const timestamp = (d: Date) => ({ toDate: () => d, seconds: d.getTime() / 1000 });

const sessionDoc = () => ({
  ...session,
  startedAt: timestamp(new Date("2026-09-28T09:05:00Z")),
  completedAt: timestamp(new Date("2026-09-28T09:24:00Z")),
  createdAt: timestamp(now),
  updatedAt: timestamp(now),
});

const exerciseDoc = (overrides: Record<string, unknown> = {}) => ({
  ...exercises[0],
  createdAt: timestamp(now),
  updatedAt: timestamp(now),
  ...overrides,
});

describe("fetchProgressFacts with Firestore Timestamps", () => {
  it("converts session and exercise Timestamps instead of throwing", async () => {
    mocks.getDocs
      .mockResolvedValueOnce({ docs: [{ data: () => sessionDoc() }] } as never)
      .mockResolvedValueOnce({ docs: [{ data: () => exerciseDoc({ completed: true }) }] } as never);
    const facts = await fetchProgressFacts({ db: {} as never }, "u1");
    expect(facts.sessions).toHaveLength(1);
    expect(facts.exercises).toHaveLength(1);
    expect(facts.exercises[0].completed).toBe(true);
  });
});

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
