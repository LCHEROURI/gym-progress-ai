// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TodayScreen from "./TodayScreen";
import { buildRecoveryInfo } from "../today/recovery";

// 2026-09-28 is a Monday → MONDAY template (leg press 2×10, chest press 2×10,
// seated row 2×10, leg curl 2×8–10, plus cardio/stretch blocks).
const monday = new Date("2026-09-28T09:00:00");

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
