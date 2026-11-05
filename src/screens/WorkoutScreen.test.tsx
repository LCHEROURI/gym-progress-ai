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
    onFinish: vi.fn(),
    ...overrides,
  };
  render(<WorkoutScreen {...props} />);
  return props;
}

describe("WorkoutScreen (gym clipboard)", () => {
  it("shows progress and the previous weight", () => {
    renderScreen();
    expect(screen.getByText("0 of 7 complete")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Workout completion" })).toHaveValue(0);
    expect(screen.getByText("LAST: 70 LB")).toBeInTheDocument();
  });

  it("shows reps with today's weight on the card header", () => {
    renderScreen();
    expect(screen.getByText("2 × 10 @ 70 LB")).toBeInTheDocument();
    expect(screen.getAllByText("2 × 10 @ 0 LB")).toHaveLength(2);
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

  it("shows completion on the workout progress bar", () => {
    const completed = exercises.map((exercise, index) =>
      index < 2 ? { ...exercise, completed: true } : exercise,
    );
    renderScreen({ exercises: completed });
    expect(screen.getByRole("progressbar", { name: "Workout completion" })).toHaveValue(2);
  });

  it("skips a saved exercise missing from the current template without crashing", () => {
    const orphan = { ...exercises[0]!, exerciseKey: "removed-from-template" };
    renderScreen({ exercises: [orphan] });

    expect(screen.getByRole("button", { name: "FINISH WORKOUT" })).toBeInTheDocument();
    expect(screen.queryByText("Bike Warm-up")).toBeNull();
  });

  it("uses the selected weight unit in the input label", () => {
    const kgExercises = exercises.map((exercise) => ({
      ...exercise,
      weightUnit: "kg" as const,
    }));
    renderScreen({ exercises: kgExercises });
    expect(screen.getAllByLabelText("Today's weight in kg").length).toBeGreaterThan(0);
  });

  it("leaves the weight last used and the reps last performed in the input boxes as a past reference", () => {
    renderScreen({
      previousReps: { "leg-press": [10, 8] },
    });
    expect(screen.getByText("LAST: 70 LB · 10, 8 REPS")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Today's weight in lb")[0]).toHaveValue(70);
    expect(screen.getAllByLabelText("Set 1 reps")[0]).toHaveValue(10);
    expect(screen.getAllByLabelText("Set 2 reps")[0]).toHaveValue(8);
  });

  it("updates weight and rep input boxes when accepting the AI coach suggestion", () => {
    const props = renderScreen({
      previousReps: { "leg-press": [10, 10] },
      recommendations: {
        "leg-press": {
          recommendation: {
            action: "increase",
            previousWeight: 70,
            suggestedWeight: 75,
            previousReps: [10, 10],
            suggestedReps: 12,
            targetSets: 2,
            lastDifficulty: "easy",
            reason:
              "You completed 10, 10 reps at 70 lb and rated the resistance as easy. For steady muscle mass building at 73, a small increase may be reasonable: try 75 lb for 2 sets of 12 controlled reps.",
            blockedBySafety: false,
            contextFacts: {},
          },
          reason:
            "You completed 10, 10 reps at 70 lb and rated the resistance as easy. For steady muscle mass building at 73, a small increase may be reasonable: try 75 lb for 2 sets of 12 controlled reps.",
        },
      },
      onDecide: vi.fn(),
    });
    expect(screen.getAllByLabelText("Set 1 reps")[0]).toHaveValue(10);
    fireEvent.click(screen.getByRole("button", { name: "USE 75 LB" }));
    expect(props.onPatchExercise).toHaveBeenCalledWith("leg-press", { weightUsed: 75 });
    expect(screen.getAllByLabelText("Set 1 reps")[0]).toHaveValue(12);
    expect(screen.getAllByLabelText("Set 2 reps")[0]).toHaveValue(12);
  });
});
