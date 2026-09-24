// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TodayScreen from "./TodayScreen";

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
});
