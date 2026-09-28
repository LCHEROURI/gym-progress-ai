import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
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

/**
 * Regression: these loaders parsed Firestore documents straight into Zod
 * schemas that declare z.date(), so every read threw on a real Timestamp and
 * History/Progress showed "Could not load" forever. The bug survived because
 * every fixture here is built by buildSession(), which already emits plain
 * Dates — the tests modelled the client SDK, not the wire format the Admin
 * and web SDKs actually return. The fixtures below carry Timestamps on purpose.
 */
const timestamp = (d: Date) => ({ toDate: () => d, seconds: d.getTime() / 1000 });

/** buildSession output, but with Timestamps where Firestore would put them. */
const sessionDoc = (overrides: Record<string, unknown> = {}) => ({
  ...session,
  startedAt: timestamp(new Date("2026-09-28T09:05:00Z")),
  completedAt: timestamp(new Date("2026-09-28T09:24:00Z")),
  createdAt: timestamp(now),
  updatedAt: timestamp(now),
  ...overrides,
});

const exerciseDoc = (overrides: Record<string, unknown> = {}) => ({
  ...exercises[0],
  createdAt: timestamp(now),
  updatedAt: timestamp(now),
  ...overrides,
});

describe("every loader converts Firestore Timestamps before validating", () => {
  // The structural guard. Four separate loaders shipped the same omission and
  // it was caught only by clicking through a signed-in account, because every
  // fixture was built with buildSession(), which already emits plain Dates.
  // A new loader that parses a snapshot without withDateFields() fails here
  // rather than in front of a user.
  const loaders = ["history.ts", "progress.ts", "reports.ts", "session-repository.ts"];
  it("no loader parses a raw snapshot straight into a schema", () => {
    const offenders: string[] = [];
    for (const file of loaders) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      // Strip comments so the prose in this repo's own doc blocks cannot be
      // mistaken for code, then match each parse call up to its closing paren
      // across newlines — a single-line regex would miss the multi-line calls
      // and pass vacuously, which is the failure this test exists to prevent.
      const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      for (const match of code.matchAll(/(\w+Schema)\.parse\(/g)) {
        // Take the balanced argument list starting after the open paren.
        const start = match.index! + match[0].length;
        let depth = 1;
        let i = start;
        while (i < code.length && depth > 0) {
          if (code[i] === "(") depth++;
          else if (code[i] === ")") depth--;
          i++;
        }
        const args = code.slice(start, i - 1);
        if (!/\.data\(\)/.test(args)) continue;
        if (args.includes("withDateFields")) continue;
        offenders.push(`${file}: ${match[1]}.parse(${args.trim()})`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("Timestamp-shaped documents (the shape Firestore actually returns)", () => {
  it("fetchHistory converts Timestamps instead of throwing", async () => {
    mocks.getDocs
      .mockResolvedValueOnce({ docs: [{ data: () => sessionDoc() }] } as never)
      .mockResolvedValueOnce({ docs: [{ data: () => exerciseDoc({ completed: true }) }] } as never);
    const rows = await fetchHistory(ctx, "u1");
    expect(rows).toHaveLength(1);
    expect(rows[0].exercisesDone).toBe(1);
  });

  it("fetchHistoryDetail converts session, exercise, and set Timestamps", async () => {
    mocks.getDoc.mockResolvedValueOnce({ data: () => sessionDoc() } as never);
    mocks.getDocs
      .mockResolvedValueOnce({ docs: [{ data: () => exerciseDoc() }] } as never)
      .mockResolvedValueOnce({
        docs: [
          {
            data: () => ({
              setNumber: 1,
              weight: 135,
              reps: 10,
              completed: true,
              createdAt: timestamp(now),
            }),
          },
        ],
      } as never);
    const detail = await fetchHistoryDetail(ctx, "u1", "s1");
    expect(detail.session.completedAt).toBeInstanceOf(Date);
    expect(detail.exercises[0].createdAt).toBeInstanceOf(Date);
    expect(detail.sets[0].createdAt).toBeInstanceOf(Date);
  });

  it("a null timestamp stays null rather than becoming Invalid Date", async () => {
    // startedAt/completedAt are nullable; the converter must not touch nulls.
    mocks.getDocs
      .mockResolvedValueOnce({
        docs: [{ data: () => sessionDoc({ startedAt: null, completedAt: null }) }],
      } as never)
      .mockResolvedValueOnce({ docs: [] } as never);
    const rows = await fetchHistory(ctx, "u1");
    expect(rows).toHaveLength(1);
  });
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
