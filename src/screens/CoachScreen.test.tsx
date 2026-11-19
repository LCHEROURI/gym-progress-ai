// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchProgressFacts: vi.fn(async () => ({
    sessions: [{ id: "s1", scheduledDate: "2026-09-07", status: "completed" as const }],
    exercises: [],
  })),
  askCoach: vi.fn<() => Promise<CoachAnswer>>(async () => ({
    text: "You completed 1 workout this month.",
    source: "model",
    diagnostic: null,
    model: "gemini-2.5-flash",
    promptVersion: "coach-chat-v3",
  })),
}));
vi.mock("../data/progress", () => ({ fetchProgressFacts: mocks.fetchProgressFacts }));
vi.mock("../coach/chat", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  askCoach: mocks.askCoach,
}));

import CoachScreen from "./CoachScreen";
import type { CoachAnswer } from "../coach/chat";

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

  it("labels a fallback answer as computed from recorded data, not Gemini", async () => {
    mocks.askCoach.mockResolvedValueOnce({
      text: "You completed 1 workout this month (1 in total).",
      source: "deterministic",
      diagnostic: {
        category: "quota",
        detail: "The AI quota for this period is used up. Try again later.",
      },
      model: null,
      promptVersion: null,
    });
    render(<CoachScreen db={{} as never} uid="u1" app={{} as never} />);
    await screen.findByText("Workout history ready.");

    fireEvent.change(screen.getByRole("textbox", { name: "Ask the coach" }), {
      target: { value: "How many workouts did I complete this month?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "SEND" }));

    expect(
      await screen.findByText("Coach unavailable — answer computed from your recorded data."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The AI quota for this period is used up. Try again later."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("You completed 1 workout this month (1 in total)."),
    ).toBeInTheDocument();
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

  it("interactively confirms and saves an extra exercise requested in chat", async () => {
    const onSaveProfile = vi.fn(async () => undefined);
    render(
      <CoachScreen
        db={{} as never}
        uid="u1"
        app={{} as never}
        profile={{ extraExercises: [] }}
        onSaveProfile={onSaveProfile}
      />,
    );
    await screen.findByText("Workout history ready.");

    const input = screen.getByRole("textbox", { name: "Ask the coach" });
    const sendButton = screen.getByRole("button", { name: "SEND" });

    // Step 1: User asks to add biceps curls
    fireEvent.change(input, { target: { value: "add biceps curls" } });
    fireEvent.click(sendButton);

    expect(
      await screen.findByText(
        "I can add Biceps Curl (2 sets × 10 reps) to every workout. Would you like me to add it?",
      ),
    ).toBeInTheDocument();

    // Step 2: User confirms with "yes"
    fireEvent.change(input, { target: { value: "yes" } });
    fireEvent.click(sendButton);

    expect(
      await screen.findByText(
        "Added Biceps Curl (2 sets × 10 reps) to your extra exercises. It will appear at the end of every workout.",
      ),
    ).toBeInTheDocument();
    expect(onSaveProfile).toHaveBeenCalledOnce();
  });
});
