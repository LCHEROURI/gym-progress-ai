import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildWeeklyReport } from "../reports/weekly";

const report = buildWeeklyReport({
  weekStart: "2026-09-21",
  sessions: [{ id: "s1", scheduledDate: "2026-09-21", status: "completed" }],
  exercises: [],
});

const mocks = vi.hoisted(() => ({
  getDocs: vi.fn(async () => ({ docs: [] })),
  getDoc: vi.fn(async () => ({ data: () => undefined })),
}));

vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, ...p: string[]) => p.join("/"),
  doc: (_db: unknown, ...p: string[]) => p.join("/"),
  query: (x: unknown) => x,
  orderBy: (x: unknown) => x,
  getDocs: mocks.getDocs,
  getDoc: mocks.getDoc,
}));

import { fetchReport, fetchReports } from "./reports";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchReports", () => {
  it("returns validated reports newest first", async () => {
    mocks.getDocs.mockResolvedValueOnce({ docs: [{ data: () => report }] } as never);
    const rows = await fetchReports({ db: {} as never }, "u1");
    expect(rows).toHaveLength(1);
    expect(rows[0].weekStart).toBe("2026-09-21");
  });
});

describe("fetchReport", () => {
  it("returns null when the week was never saved", async () => {
    expect(await fetchReport({ db: {} as never }, "u1", "w2026-09-14")).toBeNull();
  });
});
