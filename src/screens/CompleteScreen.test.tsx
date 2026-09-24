// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CompleteScreen from "./CompleteScreen";

const summary = {
  exercisesDone: 7,
  exercisesTotal: 7,
  strengthSets: 8,
  cardioMinutes: 18,
  durationMinutes: 46,
};

describe("CompleteScreen", () => {
  it("shows every completion stat", () => {
    render(<CompleteScreen summary={summary} onDone={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("WORKOUT COMPLETE");
    expect(screen.getByText("7 / 7")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("18 minutes")).toBeInTheDocument();
    expect(screen.getByText("46 minutes")).toBeInTheDocument();
  });

  it("DONE returns to the flow", () => {
    const onDone = vi.fn();
    render(<CompleteScreen summary={summary} onDone={onDone} />);
    fireEvent.click(screen.getByRole("button", { name: "DONE" }));
    expect(onDone).toHaveBeenCalledOnce();
  });
});
