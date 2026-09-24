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
  it("offers the brief's quick questions", () => {
    render(<CoachScreen db={{} as never} uid="u1" app={{} as never} />);
    expect(
      screen.getByRole("button", { name: "What weight should I use today?" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Which exercise has stalled?" }),
    ).toBeEnabled();
  });

  it("asks with a quick question and shows both bubbles", async () => {
    render(<CoachScreen db={{} as never} uid="u1" app={{} as never} />);
    fireEvent.click(screen.getByRole("button", { name: "How many workouts did I complete this month?" }));
    expect(
      screen.getAllByText("How many workouts did I complete this month?"),
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
});
