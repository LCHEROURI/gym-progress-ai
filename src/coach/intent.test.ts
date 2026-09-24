import { describe, expect, it } from "vitest";
import { TEMPLATES } from "../domain/templates";
import { classifyQuestion, type KnownExercise } from "./intent";

const knownExercises: KnownExercise[] = [
  ...new Map(
    TEMPLATES.flatMap((t) => t.exercises).map((e) => [e.key, { key: e.key, name: e.name }]),
  ).values(),
];

const classify = (question: string) => classifyQuestion({ question, knownExercises });

describe("classifyQuestion (brief's example questions)", () => {
  it("routes weight questions", () => {
    expect(classify("What weight should I use today?")).toMatchObject({
      intent: "weightToday",
    });
  });

  it("routes progress questions with their exercise", () => {
    expect(classify("How am I progressing on leg press?")).toMatchObject({
      intent: "progress",
      exerciseKey: "leg-press",
    });
    expect(classify("Show my chest press improvement.")).toMatchObject({
      intent: "progress",
      exerciseKey: "chest-press",
    });
  });

  it("routes superlative and stall questions", () => {
    expect(classify("Which exercise has improved most?")).toMatchObject({
      intent: "mostImproved",
    });
    expect(classify("Which exercise has stalled?")).toMatchObject({
      intent: "stalled",
    });
  });

  it("routes count and cardio questions", () => {
    expect(classify("How many workouts did I complete this month?")).toMatchObject({
      intent: "workoutsCount",
    });
    expect(classify("How much cardio did I do?")).toMatchObject({ intent: "cardio" });
  });

  it("routes focus questions and falls back to general", () => {
    expect(classify("What should I focus on next week?")).toMatchObject({ intent: "focus" });
    expect(classify("hello coach")).toMatchObject({ intent: "general", exerciseKey: null });
  });
});
