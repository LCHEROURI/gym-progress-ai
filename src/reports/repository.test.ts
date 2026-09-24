import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setDoc: vi.fn(async () => {}),
}));

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...path: string[]) => path.join("/"),
  setDoc: mocks.setDoc,
}));

import { reportIdFor, saveWeeklyReport } from "./repository";
import { buildWeeklyReport } from "./weekly";

const report = buildWeeklyReport({
  weekStart: "2026-09-21",
  sessions: [{ id: "s1", scheduledDate: "2026-09-21", status: "completed" }],
  exercises: [],
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("saveWeeklyReport", () => {
  it("stores the report under its week id", async () => {
    await saveWeeklyReport({ db: {} as never }, "u1", report);
    const [ref] = mocks.setDoc.mock.calls[0] as unknown as [string];
    expect(ref).toBe(`users/u1/weeklyReports/${reportIdFor("2026-09-21")}`);
  });

  it("rejects an invalid report without writing", async () => {
    await expect(
      saveWeeklyReport({ db: {} as never }, "u1", { ...report, completionRate: 3 }),
    ).rejects.toThrow();
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });
});
