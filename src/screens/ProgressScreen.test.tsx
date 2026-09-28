// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExerciseFact } from "../progress/stats";

const fact = (over: Partial<ExerciseFact>): ExerciseFact => ({
  sessionId: "s1",
  scheduledDate: "2026-09-09",
  exerciseKey: "leg-press",
  exerciseName: "Leg Press",
  completed: true,
  weightUsed: 75,
  difficulty: "good",
  durationMinutes: null,
  ...over,
});

const facts = {
  sessions: [
    { id: "s1", scheduledDate: "2026-09-09", status: "completed" as const },
    { id: "s2", scheduledDate: "2026-09-11", status: "completed" as const },
  ],
  exercises: [
    fact({}),
    fact({ sessionId: "s2", scheduledDate: "2026-09-11", weightUsed: 80 }),
    fact({ exerciseKey: "bike", exerciseName: "Bike", weightUsed: null, durationMinutes: 12 }),
  ],
};

const mocks = vi.hoisted(() => ({
  fetchProgressFacts: vi.fn(async () => facts),
}));
vi.mock("../data/progress", () => mocks);

import ProgressScreen from "./ProgressScreen";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ProgressScreen", () => {
  it("shows totals and the personal record", async () => {
    render(<ProgressScreen db={{} as never} uid="u1" />);
    expect(await screen.findByText("PERSONAL BEST")).toBeInTheDocument();
    expect(screen.getAllByText("Leg Press")).toHaveLength(2);
    expect(screen.getByText("80")).toBeInTheDocument();
    expect(screen.getByText("Total workouts:")).toBeInTheDocument();
    expect(screen.getByText("Total cardio minutes:")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Exercise progress" })).toBeInTheDocument();
    expect(screen.getByText("Started")).toBeInTheDocument();
    expect(screen.getByText("Now")).toBeInTheDocument();
    expect(screen.getByText("Best")).toBeInTheDocument();
  });

  it("shows the exercise trend row", async () => {
    render(<ProgressScreen db={{} as never} uid="u1" />);
    expect(await screen.findByText("↑ UP")).toBeInTheDocument();
    expect(screen.getByText("75 lb")).toBeInTheDocument();
    expect(screen.getAllByText("80 lb")).toHaveLength(2);
    expect(screen.getByText(/Latest 80 lb · good/)).toBeInTheDocument();
  });

  it("invites action when there is no history", async () => {
    mocks.fetchProgressFacts.mockResolvedValueOnce({ sessions: [], exercises: [] });
    render(<ProgressScreen db={{} as never} uid="u1" />);
    expect(
      await screen.findByText(/Your first logged weight starts the record book/),
    ).toBeInTheDocument();
  });
});
