// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TodayScreen from "./TodayScreen";
import { buildRecoveryInfo } from "../today/recovery";

// 2026-09-28 is a Monday → MONDAY template (leg press 2×10, chest press 2×10,
// seated row 2×10, leg curl 2×8–10, plus cardio/stretch blocks).
const monday = new Date("2026-09-28T09:00:00");

beforeEach(() => localStorage.clear());

describe("TodayScreen", () => {
  it("shows Wednesday's Balance + Strength workout", () => {
    render(<TodayScreen today={new Date("2026-09-23T09:00:00")} />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("BALANCE + STRENGTH");
    expect(screen.getByRole("button", { name: "START WORKOUT" })).toBeEnabled();
  });

  it("lists every exercise with its target", () => {
    render(<TodayScreen today={monday} />);
    const list = screen.getByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(7);
    expect(screen.getAllByText("2 × 10 · NO WEIGHT YET")).toHaveLength(3);
    expect(screen.getByText("6 min")).toBeInTheDocument();
  });

  it("shows RECOVERY DAY on rest days", () => {
    render(<TodayScreen today={new Date("2026-09-24T09:00:00")} />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("RECOVERY DAY");
    expect(screen.queryByRole("button", { name: "START WORKOUT" })).toBeNull();
  });

  it("shows all four recovery-day facts when history is known", () => {
    const recovery = buildRecoveryInfo(
      [{ scheduledDate: "2026-09-21", status: "completed", workoutType: "strength_bike" }],
      new Date("2026-09-24T12:00:00Z"),
    );
    render(<TodayScreen today={new Date("2026-09-24T09:00:00")} recovery={recovery} />);
    expect(screen.getByText("NEXT WORKOUT")).toBeInTheDocument();
    expect(screen.getByText("Friday · Full Body + Walk")).toBeInTheDocument();
    expect(screen.getByText("LAST COMPLETED")).toBeInTheDocument();
    expect(screen.getByText("Monday · Strength + Bike")).toBeInTheDocument();
    expect(screen.getByText("1 of 3 complete")).toBeInTheDocument();
    expect(screen.getByText("RECOVERY TIP")).toBeInTheDocument();
  });

  it("shows an honest LAST COMPLETED line before any workouts exist", () => {
    const recovery = buildRecoveryInfo([], new Date("2026-09-24T12:00:00Z"));
    render(<TodayScreen today={new Date("2026-09-24T09:00:00")} recovery={recovery} />);
    expect(screen.getByText("No workouts yet")).toBeInTheDocument();
  });
});

describe("TodayScreen plan cards (weight display)", () => {
  it("shows reps with the last weight and the suggested next weight", () => {
    render(
      <TodayScreen
        today={monday}
        onStart={() => undefined}
        previousWeights={{ "leg-press": 70, "chest-press": 50 }}
        nextWeights={{
          "leg-press": { action: "increase", suggestedWeight: 75 },
          "chest-press": { action: "keep", suggestedWeight: 50 },
        }}
        weightUnit="lb"
      />,
    );
    expect(screen.getByText("2 × 10 @ 70 LB")).toBeInTheDocument();
    expect(screen.getByText("NEXT: 75 LB")).toBeInTheDocument();
    expect(screen.getByText("2 × 10 @ 50 LB")).toBeInTheDocument();
    expect(screen.getByText("KEEP: 50 LB")).toBeInTheDocument();
  });

  it("never fabricates a weight: shows NO WEIGHT YET and no suggestion without history", () => {
    render(<TodayScreen today={monday} onStart={() => undefined} previousWeights={{}} />);
    expect(screen.getAllByText(/NO WEIGHT YET/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/NEXT:|KEEP:/)).not.toBeInTheDocument();
  });

  it("shows the form tip on each exercise card", () => {
    render(<TodayScreen today={monday} onStart={() => undefined} />);
    expect(
      screen.getByText("Keep your feet flat and avoid locking your knees."),
    ).toBeInTheDocument();
    expect(screen.getByText("Move slowly on the way down.")).toBeInTheDocument();
  });
});

describe("TodayScreen one-tap weight pre-fill", () => {
  const planProps = {
    previousWeights: { "leg-press": 70, "chest-press": 50 } as Record<
      string,
      number | null
    >,
    nextWeights: {
      "leg-press": { action: "increase" as const, suggestedWeight: 75 },
      "chest-press": { action: "keep" as const, suggestedWeight: 50 },
    },
  };

  it("tapping NEXT picks that weight for today", () => {
    const onPickWeight = vi.fn();
    render(
      <TodayScreen today={monday} {...planProps} onPickWeight={onPickWeight} />,
    );
    const line = screen.getByRole("button", { name: "NEXT: 75 LB" });
    expect(line).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(line);
    expect(onPickWeight).toHaveBeenCalledWith("leg-press", 75);
  });

  it("tapping the picked line again un-picks it", () => {
    const onPickWeight = vi.fn();
    render(
      <TodayScreen
        today={monday}
        {...planProps}
        pickedWeights={{ "leg-press": 75 }}
        onPickWeight={onPickWeight}
      />,
    );
    const line = screen.getByRole("button", { name: "NEXT: 75 LB" });
    expect(line).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(line);
    expect(onPickWeight).toHaveBeenCalledWith("leg-press", null);
  });

  it("the KEEP line is tappable too", () => {
    const onPickWeight = vi.fn();
    render(
      <TodayScreen today={monday} {...planProps} onPickWeight={onPickWeight} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "KEEP: 50 LB" }));
    expect(onPickWeight).toHaveBeenCalledWith("chest-press", 50);
  });
});

describe("Recovery day actions (a rest day is still usable)", () => {
  const recovery = buildRecoveryInfo([], new Date("2026-09-24T12:00:00Z"));

  it("offers to start the next workout today", () => {
    const onStartWorkout = vi.fn();
    render(
      <TodayScreen
        today={new Date("2026-09-24T09:00:00")}
        recovery={recovery}
        onStartWorkout={onStartWorkout}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "START A WORKOUT TODAY" }),
    );
    expect(onStartWorkout).toHaveBeenCalledOnce();
  });

  it("jumps to Progress and the Coach from the rest day", () => {
    const onSeeProgress = vi.fn();
    const onAskCoach = vi.fn();
    render(
      <TodayScreen
        today={new Date("2026-09-24T09:00:00")}
        recovery={recovery}
        onSeeProgress={onSeeProgress}
        onAskCoach={onAskCoach}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "SEE PROGRESS" }));
    fireEvent.click(screen.getByRole("button", { name: "ASK THE COACH" }));
    expect(onSeeProgress).toHaveBeenCalledOnce();
    expect(onAskCoach).toHaveBeenCalledOnce();
  });
});

describe("first-run welcome card", () => {
  it("greets a known new user with what to do first", () => {
    render(<TodayScreen today={monday} hasCompleted={false} />);
    expect(screen.getByText(/WELCOME TO GYM PROGRESS AI/)).toBeInTheDocument();
    expect(screen.getByText(/remembers/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "GOT IT" })).toBeInTheDocument();
  });

  it("GOT IT dismisses it for good", () => {
    const first = render(<TodayScreen today={monday} hasCompleted={false} />);
    fireEvent.click(screen.getByRole("button", { name: "GOT IT" }));
    expect(screen.queryByText(/WELCOME TO GYM PROGRESS AI/)).toBeNull();
    first.unmount();
    render(<TodayScreen today={monday} hasCompleted={false} />);
    expect(screen.queryByText(/WELCOME TO GYM PROGRESS AI/)).toBeNull();
  });

  it("stays away once any workout is completed", () => {
    render(<TodayScreen today={monday} hasCompleted={true} />);
    expect(screen.queryByText(/WELCOME TO GYM PROGRESS AI/)).toBeNull();
  });

  it("never flashes while history is still loading", () => {
    render(<TodayScreen today={monday} />);
    expect(screen.queryByText(/WELCOME TO GYM PROGRESS AI/)).toBeNull();
  });
});
