// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchProgressFacts: vi.fn(async () => ({
    sessions: [{ id: "s1", scheduledDate: "2026-09-07", status: "completed" as const }],
    exercises: [],
  })),
  askCoach: vi.fn(async () => "You completed 1 workout this month."),
}));
vi.mock("../data/progress", () => ({ fetchProgressFacts: mocks.fetchProgressFacts }));
vi.mock("../coach/chat", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  askCoach: mocks.askCoach,
}));

import CoachScreen from "./CoachScreen";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CoachScreen", () => {
  it("offers the brief's quick questions", async () => {
    render(<CoachScreen db={{} as never} uid="u1" app={{} as never} />);
    expect(await screen.findByText("Workout history ready.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "What weight should I use today?" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Which exercise has stalled?" }),
    ).toBeEnabled();
  });

  it("asks with a quick question and shows both bubbles", async () => {
    render(<CoachScreen db={{} as never} uid="u1" app={{} as never} />);
    await screen.findByText("Workout history ready.");
    fireEvent.click(screen.getByRole("button", { name: "How many workouts did I complete this month?" }));
    expect(
      await screen.findAllByText("How many workouts did I complete this month?"),
    ).toHaveLength(2);
    await waitFor(() => {
      expect(mocks.askCoach).toHaveBeenCalledOnce();
    });
    expect(await screen.findByText("You completed 1 workout this month.")).toBeInTheDocument();
  });

  it("sends typed questions too", async () => {
    render(<CoachScreen db={{} as never} uid="u1" app={{} as never} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Ask the coach" }), {
      target: { value: "How am I progressing on leg press?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "SEND" }));
    await waitFor(() => {
      expect(mocks.askCoach).toHaveBeenCalledOnce();
    });
  });

  it("suggests workout chips from the last session's effort", async () => {
    mocks.fetchProgressFacts.mockResolvedValueOnce({
      sessions: [
        { id: "s9", scheduledDate: "2026-09-25", status: "completed" as const },
      ],
      exercises: [
        {
          sessionId: "s9",
          scheduledDate: "2026-09-25",
          exerciseKey: "leg-press",
          exerciseName: "Leg Press",
          completed: true,
          weightUsed: 70,
          difficulty: "hard" as const,
          durationMinutes: null,
        },
      ],
    } as never);
    render(<CoachScreen db={{} as never} uid="u1" app={{} as never} />);
    expect(
      await screen.findByRole("button", { name: "Plan a lighter next workout" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "What should I keep steady?" }),
    ).toBeEnabled();
  });
});
