// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TodayScreen from "./TodayScreen";
import { buildRecoveryInfo } from "../today/recovery";

describe("TodayScreen", () => {
  it("shows Wednesday's Balance + Strength workout", () => {
    render(<TodayScreen today={new Date("2026-09-23T09:00:00")} />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("BALANCE + STRENGTH");
    expect(screen.getByRole("button", { name: "START WORKOUT" })).toBeEnabled();
  });

  it("lists every exercise with its target", () => {
    render(<TodayScreen today={new Date("2026-09-28T09:00:00")} />);
    const list = screen.getByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(7);
    expect(screen.getAllByText("2 × 10")).toHaveLength(3);
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
