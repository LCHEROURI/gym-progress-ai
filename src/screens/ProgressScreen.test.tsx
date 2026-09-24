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
    expect(screen.getByText("LEG PRESS")).toBeInTheDocument();
    expect(screen.getByText(/80 LB/)).toBeInTheDocument();
    expect(screen.getByText("Total workouts:")).toBeInTheDocument();
    expect(screen.getByText("Total cardio minutes:")).toBeInTheDocument();
  });

  it("shows the exercise trend row", async () => {
    render(<ProgressScreen db={{} as never} uid="u1" />);
    expect(await screen.findByText("↑ UP")).toBeInTheDocument();
    expect(screen.getByText(/Start 75 lb → Current 80 lb/)).toBeInTheDocument();
  });

  it("invites action when there is no history", async () => {
    mocks.fetchProgressFacts.mockResolvedValueOnce({ sessions: [], exercises: [] });
    render(<ProgressScreen db={{} as never} uid="u1" />);
    expect(
      await screen.findByText(/No personal records yet — they appear after your first logged weight/),
    ).toBeInTheDocument();
  });
});
