// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildExerciseSession, buildSession } from "../domain/session";
import { MONDAY } from "../domain/templates";

const mocks = vi.hoisted(() => ({
  initFirebase: vi.fn(async () => ({ app: {} as never, auth: {} as never, db: {} as never })),
  fetchProfile: vi.fn(async () => ({ mocked: true })),
  saveProfile: vi.fn(async () => undefined),
  fetchHistory: vi.fn(async () => []),
  useSyncStatus: vi.fn(() => "saved"),
  fetchActiveWorkout: vi.fn(async () => null),
  fetchPreviousWeights: vi.fn(async () => ({ "leg-press": 70, "chest-press": 50 })),
  startSession: vi.fn(async (_ctx: unknown, input: { template: typeof MONDAY; previousWeights: Record<string, number | null>; initialWeights?: Record<string, number>; weightUnit?: "lb" | "kg" }) => ({
    session: { id: "sx", status: "in_progress", startedAt: new Date() },
    exercises: input.template.exercises.map((exercise) =>
      buildExerciseSession({
        template: input.template,
        order: exercise.order,
        previousWeight: input.previousWeights[exercise.key] ?? null,
        initialWeight: input.initialWeights?.[exercise.key],
        weightUnit: exercise.kind === "resistance" ? input.weightUnit ?? "lb" : null,
      }),
    ),
  })),
  saveExercise: vi.fn(
    async (
      _c: unknown,
      i: { current: Record<string, unknown>; patch: Record<string, unknown> },
    ) => ({ ...i.current, ...i.patch }),
  ),
  saveSession: vi.fn(
    async (
      _c: unknown,
      i: { current: Record<string, unknown>; patch: Record<string, unknown> },
    ) => ({ ...i.current, ...i.patch }),
  ),
  logSet: vi.fn(async () => {}),
  fetchRecentDetails: vi.fn(async () => [] as unknown[]),
  saveRecommendation: vi.fn(async () => {}),
  recordDecision: vi.fn(async () => {}),
}));

vi.mock("../data/firebase", () => ({ initFirebase: mocks.initFirebase }));
vi.mock("../data/settings", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchProfile: mocks.fetchProfile,
  saveProfile: mocks.saveProfile,
}));
vi.mock("../data/history", () => ({
  fetchHistory: mocks.fetchHistory,
  fetchRecentDetails: mocks.fetchRecentDetails,
}));
vi.mock("../data/session-repository", () => ({
  fetchActiveWorkout: mocks.fetchActiveWorkout,
  fetchPreviousWeights: mocks.fetchPreviousWeights,
  startSession: mocks.startSession,
  saveExercise: mocks.saveExercise,
  saveSession: mocks.saveSession,
  logSet: mocks.logSet,
}));
vi.mock("../coach/recommendations", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  saveRecommendation: mocks.saveRecommendation,
  recordDecision: mocks.recordDecision,
}));
vi.mock("../data/useSyncStatus", () => ({ useSyncStatus: mocks.useSyncStatus }));
vi.mock("../shared/env", () => ({ parseEnv: () => ({}) }));

import WorkoutFlow from "./WorkoutFlow";
import { defaultProfile } from "../data/settings";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchProfile.mockResolvedValue(defaultProfile() as never);
  mocks.fetchRecentDetails.mockResolvedValue([]);
  mocks.fetchActiveWorkout.mockResolvedValue(null);
  window.history.replaceState(null, "", "/");
});

describe("WorkoutFlow ?screen= deep links (dev)", () => {
  it("opens the requested screen directly by URL", async () => {
    window.history.replaceState(null, "", "/?screen=settings");
    render(<WorkoutFlow uid="u1" />);
    expect(
      await screen.findByRole("heading", { name: "SETTINGS" }),
    ).toBeInTheDocument();
  });

  it("keeps the URL in sync while navigating", async () => {
    window.history.replaceState(null, "", "/?screen=settings");
    render(<WorkoutFlow uid="u1" />);
    await screen.findByRole("heading", { name: "SETTINGS" });
    fireEvent.click(screen.getByRole("button", { name: "HISTORY" }));
    expect(window.location.search).toBe("?screen=history");
    expect(screen.getByRole("heading", { name: "HISTORY" })).toBeInTheDocument();
    expect(await screen.findByText("No workouts yet. Your first one starts today.")).toBeInTheDocument();
  });

  it("falls back to today for unknown screens", async () => {
    window.history.replaceState(null, "", "/?screen=bogus");
    render(<WorkoutFlow uid="u1" />);
    expect(await screen.findByRole("button", { name: "TODAY" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(window.location.search).toBe("?screen=bogus");
  });
});

// One past leg-press session (70 LB × 10 × 10, felt good) so the plan preview
// computes the deterministic "NEXT: 75 LB" for leg press.
const t0 = new Date("2026-09-28T09:00:00Z");
function recentDetail(weight: number, reps: number[]) {
  const session = buildSession({
    sessionId: "old1",
    uid: "u1",
    template: MONDAY,
    scheduledDate: "2026-09-25",
    now: t0,
  });
  const exercises = MONDAY.exercises.map((t) => ({
    ...buildExerciseSession({
      template: MONDAY,
      order: t.order,
      previousWeight: null,
      weightUnit: "lb",
      now: t0,
    }),
    completed: true,
    weightUsed: t.kind === "resistance" ? weight : null,
  }));
  const sets = reps.map((r, i) => ({
    exerciseKey: "leg-press",
    setNumber: i + 1,
    weight,
    reps: r,
    completed: true,
    createdAt: t0,
  }));
  return { session, exercises, sets };
}

describe("one-tap weight pre-fill (tap NEXT → start → prefilled)", () => {
  it("tapping NEXT then START WORKOUT opens with today's weight prefilled", async () => {
    // Fake only the clock (Monday template needs a Monday) — timers stay real
    // so testing-library's waitFor works untouched.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-28T09:00:00"));
    try {
      mocks.fetchProfile.mockResolvedValue({
        ...defaultProfile(),
        machineIncrements: {},
      } as never);
      mocks.fetchRecentDetails.mockResolvedValue([
        recentDetail(70, [10, 10]),
      ] as never);
      render(<WorkoutFlow uid="u1" />);

      const line = await screen.findByRole("button", { name: "NEXT: 75 LB" });
      fireEvent.click(line);
      expect(line).toHaveAttribute("aria-pressed", "true");

      fireEvent.click(screen.getByRole("button", { name: "START WORKOUT" }));
      // Wait for the workout screen itself — the today plan cards are also
      // listitems, so findAllByRole would resolve against the old screen.
      await screen.findByRole("button", { name: "FINISH WORKOUT" });
      const cards = screen.getAllByRole("listitem");
      const byName = (name: string) =>
        cards.find(
          (c) => c.querySelector(".exerciseName")?.textContent === name,
        )!;
      expect(
        within(byName("Leg Press")).getByLabelText("Today's weight in pounds"),
      ).toHaveValue(75);
      // Un-picked exercises keep the LAST weight — nothing else changes.
      expect(
        within(byName("Chest Press")).getByLabelText("Today's weight in pounds"),
      ).toHaveValue(50);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("rest day is usable (start the next workout early)", () => {
  it("START A WORKOUT TODAY flips to the next plan and the workout runs", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-24T09:00:00"));
    try {
      render(<WorkoutFlow uid="u1" />);
      // Thursday is a rest day: the recovery screen greets the user.
      expect(
        await screen.findByRole("heading", { name: "RECOVERY DAY" }),
      ).toBeInTheDocument();
      fireEvent.click(
        screen.getByRole("button", { name: "START A WORKOUT TODAY" }),
      );
      // The next planned workout (Friday) becomes today's plan.
      expect(
        await screen.findByRole("heading", { name: "FULL BODY + WALK" }),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "START WORKOUT" }));
      expect(
        await screen.findByRole("button", { name: "FINISH WORKOUT" }),
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
