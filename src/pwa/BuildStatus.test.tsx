// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import BuildStatus, { UPDATE_READY_EVENT, announceUpdateReady } from "./BuildStatus";

describe("BuildStatus", () => {
  it("shows the current build identifier", () => {
    render(<BuildStatus />);
    expect(screen.getByText(/Build \d{12}/)).toBeInTheDocument();
  });

  it("announces when a service-worker update is ready", () => {
    render(<BuildStatus />);
    act(() => {
      announceUpdateReady();
    });
    expect(screen.getByText("Update ready")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "RELOAD" })).toBeEnabled();
  });

  it("uses a stable event name for the update channel", () => {
    expect(UPDATE_READY_EVENT).toBe("gym-progress-ai:update-ready");
  });
});
