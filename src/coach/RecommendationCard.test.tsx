// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import RecommendationCard from "./RecommendationCard";
import { SAFETY_MESSAGE, type Recommendation } from "./progression";

const suggestion: Recommendation = {
  action: "increase",
  previousWeight: 70,
  suggestedWeight: 75,
  reason: "You completed all sets at the target repetitions.",
  blockedBySafety: false,
  contextFacts: {},
};

describe("RecommendationCard", () => {
  it("shows the suggestion and why", () => {
    render(
      <RecommendationCard
        recommendation={suggestion}
        reason="You completed all sets at the target repetitions."
        onUse={vi.fn()}
        onKeep={vi.fn()}
        onChooseOther={vi.fn()}
      />,
    );
    expect(screen.getByText("AI SUGGESTION")).toBeInTheDocument();
    expect(screen.getByText("75 lb")).toBeInTheDocument();
    expect(screen.getByText("WHY?")).toBeInTheDocument();
  });

  it("USE applies the suggested weight, KEEP keeps the old one", () => {
    const onUse = vi.fn();
    const onKeep = vi.fn();
    render(
      <RecommendationCard
        recommendation={suggestion}
        reason="because"
        onUse={onUse}
        onKeep={onKeep}
        onChooseOther={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "USE 75 LB" }));
    expect(onUse).toHaveBeenCalledWith(75);
    fireEvent.click(screen.getByRole("button", { name: "KEEP 70 LB" }));
    expect(onKeep).toHaveBeenCalledOnce();
  });

  it("never renders a literal null when there is no history to judge", () => {
    // recommendWeight returns previousWeight: null for the insufficient-data
    // case, which is every resistance exercise on a new account. The label
    // interpolated it directly, so users saw "KEEP null LB" mid-workout.
    const cold: Recommendation = {
      ...suggestion,
      action: "keep",
      previousWeight: null,
      suggestedWeight: 0,
    };
    render(
      <RecommendationCard
        recommendation={cold}
        reason="Not enough history yet"
        onUse={vi.fn()}
        onKeep={vi.fn()}
        onChooseOther={vi.fn()}
      />,
    );
    expect(screen.queryByText(/null/)).toBeNull();
    expect(
      screen.getByRole("button", { name: "KEEP CURRENT WEIGHT" }),
    ).toBeInTheDocument();
  });

  it("hides USE and shows the safety message when progression is blocked", () => {
    const blocked: Recommendation = { ...suggestion, blockedBySafety: true, action: "keep", suggestedWeight: 70 };
    render(
      <RecommendationCard
        recommendation={blocked}
        reason={SAFETY_MESSAGE}
        onUse={vi.fn()}
        onKeep={vi.fn()}
        onChooseOther={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(SAFETY_MESSAGE);
    expect(screen.queryByRole("button", { name: /USE/ })).toBeNull();
    expect(screen.getByRole("button", { name: "KEEP CURRENT WEIGHT" })).toBeEnabled();
  });
});
