// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import StreakToast from "./StreakToast";
import type { Celebration } from "./streak";

const celebration: Celebration = {
  title: "PERFECT WEEK!",
  body: "2 weeks in a row with all 3 workouts. 🔥",
  perfectWeek: true,
  streakWeeks: 2,
};

afterEach(() => vi.useRealTimers());

describe("StreakToast", () => {
  it("shows the celebration copy", () => {
    render(<StreakToast celebration={celebration} />);
    const toast = screen.getByRole("status");
    expect(toast).toHaveTextContent("PERFECT WEEK!");
    expect(toast).toHaveTextContent("2 weeks in a row with all 3 workouts.");
  });

  it("auto-dismisses after 8 seconds", () => {
    vi.useFakeTimers();
    render(<StreakToast celebration={celebration} />);
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("can be dismissed manually", () => {
    render(<StreakToast celebration={celebration} />);
    fireEvent.click(screen.getByRole("button", { name: "DISMISS" }));
    expect(screen.queryByRole("status")).toBeNull();
  });
});
