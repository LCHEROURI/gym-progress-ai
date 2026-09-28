// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AppErrorBoundary from "./AppErrorBoundary";
import { CHUNK_RELOAD_KEY, resetChunkRecoveryForTests } from "../shared/chunk-recovery";

function BrokenScreen(): never {
  throw new Error("render failed");
}

function BrokenChunkScreen(): never {
  throw new Error(
    'Failed to fetch dynamically imported module: https://app.test/assets/WorkoutFlow-oldhash.js',
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
  resetChunkRecoveryForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

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

  it("spends the single session reload on a chunk-load failure", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <AppErrorBoundary>
        <BrokenChunkScreen />
      </AppErrorBoundary>,
    );

    // The marker is the observable proof a reload was attempted; the actual
    // navigation cannot run in jsdom.
    expect(window.sessionStorage.getItem(CHUNK_RELOAD_KEY)).toBeTruthy();
  });

  it("does not spend a reload on an ordinary render error", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <AppErrorBoundary>
        <BrokenScreen />
      </AppErrorBoundary>,
    );

    // A real bug must show the error UI, not silently reload the app.
    expect(window.sessionStorage.getItem(CHUNK_RELOAD_KEY)).toBeNull();
    expect(screen.getByRole("button", { name: "Reload app" })).toBeInTheDocument();
  });

  it("does not reload twice for two chunk failures in one document", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <AppErrorBoundary>
        <BrokenChunkScreen />
      </AppErrorBoundary>,
    );
    const afterFirst = window.sessionStorage.getItem(CHUNK_RELOAD_KEY);

    // Simulate the second failure arriving from another source.
    render(
      <AppErrorBoundary>
        <BrokenChunkScreen />
      </AppErrorBoundary>,
    );

    expect(window.sessionStorage.getItem(CHUNK_RELOAD_KEY)).toBe(afterFirst);
  });
});
