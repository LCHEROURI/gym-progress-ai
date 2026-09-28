// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildExerciseSession, buildSession } from "../domain/session";
import { WEDNESDAY } from "../domain/templates";

const now = new Date("2026-09-23T09:00:00Z");
const session = {
  ...buildSession({ sessionId: "s1", uid: "u1", template: WEDNESDAY, scheduledDate: "2026-09-23", now }),
  status: "completed" as const,
};
const exercises = WEDNESDAY.exercises.map((t) => ({
  ...buildExerciseSession({ template: WEDNESDAY, order: t.order, previousWeight: null, weightUnit: "lb", now }),
  completed: true,
}));

const mocks = vi.hoisted(() => ({
  fetchHistory: vi.fn(async () => [
    { id: "s1", scheduledDate: "2026-09-23", workoutType: "balance_strength", status: "completed", exercisesDone: 8, exercisesTotal: 8 },
  ]),
  fetchHistoryDetail: vi.fn(async () => ({ session, exercises, sets: [] })),
}));
vi.mock("../data/history", () => mocks);

import HistoryScreen from "./HistoryScreen";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("HistoryScreen", () => {
  it("lists past sessions with date, weekday, name, and counts", async () => {
    render(<HistoryScreen db={{} as never} uid="u1" />);
    expect(await screen.findByText("23")).toBeInTheDocument();
    expect(screen.getByText("SEP")).toBeInTheDocument();
    expect(screen.getByText("Balance + Strength")).toBeInTheDocument();
    expect(screen.getByText("8 of 8 exercises")).toBeInTheDocument();
    expect(screen.getByText("8/8")).toBeInTheDocument();
  });

  it("opens the detail view and goes back", async () => {
    render(<HistoryScreen db={{} as never} uid="u1" />);
    fireEvent.click(await screen.findByRole("button", { name: /Balance \+ Strength/ }));
    await waitFor(() => {
      expect(mocks.fetchHistoryDetail).toHaveBeenCalledWith({ db: {} }, "u1", "s1");
    });
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Balance + Strength");
    expect(screen.getAllByRole("listitem")).toHaveLength(8);
    fireEvent.click(screen.getByRole("button", { name: /All workouts/ }));
    expect(await screen.findByText("8 of 8 exercises")).toBeInTheDocument();
  });
});
