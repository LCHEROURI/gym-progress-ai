// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildWeeklyReport } from "../reports/weekly";

const report = {
  ...buildWeeklyReport({
    weekStart: "2026-09-21",
    sessions: [
      { id: "s1", scheduledDate: "2026-09-21", status: "completed" as const },
      { id: "s2", scheduledDate: "2026-09-23", status: "completed" as const },
      { id: "s3", scheduledDate: "2026-09-25", status: "completed" as const },
    ],
    exercises: [
      { sessionId: "s1", scheduledDate: "2026-09-21", exerciseKey: "leg-press", exerciseName: "Leg Press", completed: true, weightUsed: 70, difficulty: "good", durationMinutes: null },
      { sessionId: "s3", scheduledDate: "2026-09-25", exerciseKey: "leg-press", exerciseName: "Leg Press", completed: true, weightUsed: 75, difficulty: "good", durationMinutes: null },
      { sessionId: "s1", scheduledDate: "2026-09-21", exerciseKey: "bike", exerciseName: "Bike", completed: true, weightUsed: null, difficulty: null, durationMinutes: 20 },
      { sessionId: "s3", scheduledDate: "2026-09-25", exerciseKey: "bike", exerciseName: "Bike", completed: true, weightUsed: null, difficulty: null, durationMinutes: 22 },
    ],
  }),
  aiObservations: ["You completed all scheduled workouts this week."],
};

const mocks = vi.hoisted(() => ({
  fetchReports: vi.fn(async () => [report]),
  generateWeeklyReport: vi.fn(async () => report),
}));
vi.mock("../data/reports", () => ({ fetchReports: mocks.fetchReports }));
vi.mock("../reports/generate", () => ({ generateWeeklyReport: mocks.generateWeeklyReport }));

import ReportsScreen, { weekLabel } from "./ReportsScreen";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ReportsScreen", () => {
  it("labels weeks in the brief's format", () => {
    expect(weekLabel(report)).toBe("September 21–27");
  });

  it("lists past reports and offers generation", async () => {
    render(<ReportsScreen db={{} as never} uid="u1" app={{} as never} />);
    expect(await screen.findByText("PAST REPORTS")).toBeInTheDocument();
    expect(screen.getByText("SEPTEMBER 21–27")).toBeInTheDocument();
    expect(screen.getByText("3/3 workouts")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "GENERATE LAST WEEK'S REPORT" }),
    ).toBeEnabled();
  });

  it("opens the report in the brief's layout", async () => {
    render(<ReportsScreen db={{} as never} uid="u1" app={{} as never} />);
    fireEvent.click(await screen.findByText("SEPTEMBER 21–27"));
    expect(screen.getByText("WEEKLY FITNESS REPORT")).toBeInTheDocument();
    expect(screen.getByText(/Leg Press 70 → 75 lb/)).toBeInTheDocument();
    expect(screen.getByText("Total: 42 minutes")).toBeInTheDocument();
    expect(
      screen.getByText("You completed all scheduled workouts this week."),
    ).toBeInTheDocument();
    expect(screen.getByText(/Consider maintaining 75 lb/)).toBeInTheDocument();
  });

  it("generates on demand and lands on the new report", async () => {
    render(<ReportsScreen db={{} as never} uid="u1" app={{} as never} />);
    fireEvent.click(screen.getByRole("button", { name: "GENERATE LAST WEEK'S REPORT" }));
    await waitFor(() => {
      expect(mocks.generateWeeklyReport).toHaveBeenCalledOnce();
    });
    expect(await screen.findByText("WEEKLY FITNESS REPORT")).toBeInTheDocument();
  });
});
