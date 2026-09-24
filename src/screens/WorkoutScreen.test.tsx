// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MONDAY, type WorkoutTemplate } from "../domain/templates";
import {
  buildExerciseSession,
  buildSession,
  type ExerciseSession,
  type WorkoutSession,
} from "../domain/session";
import WorkoutScreen from "./WorkoutScreen";

const now = new Date("2026-09-28T09:00:00Z");
const template: WorkoutTemplate = MONDAY;
const session: WorkoutSession = buildSession({
  sessionId: "s1", uid: "u1", template, scheduledDate: "2026-09-28", now,
});
const exercises: ExerciseSession[] = template.exercises.map((t) =>
  buildExerciseSession({
    template,
    order: t.order,
    previousWeight: t.key === "leg-press" ? 70 : null,
    weightUnit: "lb",
    now,
  }),
);

function renderScreen(overrides: Partial<Parameters<typeof WorkoutScreen>[0]> = {}) {
  const props = {
    template,
    session,
    exercises,
    syncState: "saved" as const,
    error: null,
    onPatchExercise: vi.fn(),
    onPatchSession: vi.fn(),
    onLogSet: vi.fn(),
    ...overrides,
  };
  render(<WorkoutScreen {...props} />);
  return props;
}

describe("WorkoutScreen (gym clipboard)", () => {
  it("shows progress and the previous weight", () => {
    renderScreen();
    expect(screen.getByText("0 of 7 complete")).toBeInTheDocument();
    expect(screen.getByText("LAST: 70 LB")).toBeInTheDocument();
  });

  it("weight + steps up by 5 lb through autosave patch", () => {
    const props = renderScreen();
    fireEvent.click(screen.getAllByRole("button", { name: "Increase weight" })[0]);
    expect(props.onPatchExercise).toHaveBeenCalledWith("leg-press", {
      weightUsed: 75,
    });
  });

  it("difficulty and pain buttons patch the exercise", () => {
    const props = renderScreen();
    fireEvent.click(screen.getAllByRole("button", { name: "GOOD" })[0]);
    expect(props.onPatchExercise).toHaveBeenCalledWith("bike-warmup", {
      difficulty: "good",
    });
    fireEvent.click(screen.getAllByRole("button", { name: "MILD" })[0]);
    expect(props.onPatchExercise).toHaveBeenCalledWith("bike-warmup", {
      painStatus: "mild",
    });
  });

  it("logs a set when reps are entered and offers rest", () => {
    const props = renderScreen();
    fireEvent.change(screen.getAllByLabelText("Set 1 reps")[0], { target: { value: "10" } });
    expect(props.onLogSet).toHaveBeenCalledOnce();
    expect(screen.getByRole("region", { name: "Rest timer" })).toBeInTheDocument();
  });

  it("COMPLETE EXERCISE toggles completion", () => {
    const props = renderScreen();
    fireEvent.click(screen.getAllByRole("button", { name: "COMPLETE EXERCISE" })[0]);
    expect(props.onPatchExercise).toHaveBeenCalledWith("bike-warmup", {
      completed: true,
    });
  });

  it("shows the OFFLINE badge", () => {
    renderScreen({ syncState: "offline" });
    expect(screen.getByText("OFFLINE")).toBeInTheDocument();
  });
});
