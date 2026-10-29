// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import BottomNav from "./BottomNav";

describe("BottomNav", () => {
  it("renders all six navigation tabs with visible text labels", () => {
    render(<BottomNav view="today" onNavigate={() => undefined} />);
    const labels = ["TODAY", "HISTORY", "PROGRESS", "AI COACH", "REPORTS", "SETTINGS"];
    for (const label of labels) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("renders a visible SETTINGS label and navigates to settings on click", () => {
    const onNavigate = vi.fn();
    render(<BottomNav view="today" onNavigate={onNavigate} />);

    const settingsButton = screen.getByRole("button", { name: "SETTINGS" });
    expect(settingsButton).toBeInTheDocument();
    expect(settingsButton).not.toHaveAttribute("aria-current");

    fireEvent.click(settingsButton);
    expect(onNavigate).toHaveBeenCalledWith("settings");
  });

  it("marks the active view with aria-current='page'", () => {
    const { rerender } = render(<BottomNav view="settings" onNavigate={() => undefined} />);
    expect(screen.getByRole("button", { name: "SETTINGS" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    rerender(<BottomNav view="coach" onNavigate={() => undefined} />);
    expect(screen.getByRole("button", { name: "AI COACH" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("button", { name: "SETTINGS" })).not.toHaveAttribute("aria-current");
  });
});
