// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AppErrorBoundary from "./AppErrorBoundary";

function BrokenScreen(): never {
  throw new Error("render failed");
}

afterEach(() => vi.restoreAllMocks());

describe("AppErrorBoundary", () => {
  it("shows a reload action instead of a blank page after a render failure", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <AppErrorBoundary>
        <BrokenScreen />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole("heading", { name: "We couldn’t load the app" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Reload this page to try again");
    expect(screen.getByRole("button", { name: "Reload app" })).toBeInTheDocument();
  });

  it("renders healthy screens normally", () => {
    render(
      <AppErrorBoundary>
        <p>Workout loaded</p>
      </AppErrorBoundary>,
    );

    expect(screen.getByText("Workout loaded")).toBeInTheDocument();
  });
});
