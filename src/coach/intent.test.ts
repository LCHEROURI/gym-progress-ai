import { describe, expect, it } from "vitest";
import { TEMPLATES } from "../domain/templates";
import {
  classifyQuestion,
  extractExerciseSlots,
  isConfirmationAccept,
  isConfirmationDecline,
  type KnownExercise,
} from "./intent";

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

  it("recognizes custom exercise names such as biceps curl", () => {
    const customKnown = [
      ...knownExercises,
      { key: "custom-biceps-curl", name: "Biceps Curl" },
    ];
    expect(
      classifyQuestion({
        question: "what weight for biceps curl",
        knownExercises: customKnown,
      }),
    ).toMatchObject({
      intent: "weightToday",
      exerciseKey: "custom-biceps-curl",
    });
    expect(
      classifyQuestion({
        question: "how is my custom biceps curl progressing?",
        knownExercises: customKnown,
      }),
    ).toMatchObject({
      intent: "progress",
      exerciseKey: "custom-biceps-curl",
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

describe("classifyQuestion (effort-aware next workout)", () => {
  it("routes the effort chips to nextWorkout", () => {
    expect(
      classify("My last workout felt hard. How should I ease off for my next workout?"),
    ).toMatchObject({ intent: "nextWorkout" });
    expect(
      classify(
        "My last workout felt good. Which exercises are ready for a small increase next workout?",
      ),
    ).toMatchObject({ intent: "nextWorkout" });
    expect(classify("Repeat next workout as-is?")).toMatchObject({
      intent: "nextWorkout",
    });
  });

  it("keeps next-week and weight questions on their own intents", () => {
    expect(classify("What should I focus on next week?")).toMatchObject({ intent: "focus" });
    expect(classify("What weight should I use today?")).toMatchObject({
      intent: "weightToday",
    });
  });
});

describe("classifyQuestion · addExercise intent", () => {
  it("routes muscle-group requests to addExercise", () => {
    expect(classify("add biceps curls")).toMatchObject({ intent: "addExercise" });
    expect(classify("add biceps")).toMatchObject({ intent: "addExercise" });
    expect(classify("include triceps work")).toMatchObject({ intent: "addExercise" });
    expect(classify("add triceps")).toMatchObject({ intent: "addExercise" });
    expect(classify("include chest work")).toMatchObject({ intent: "addExercise" });
    expect(classify("add an exercise for core")).toMatchObject({ intent: "addExercise" });
    expect(classify("add an exercise")).toMatchObject({ intent: "addExercise" });
  });

  it("routes sets and reps forms to addExercise", () => {
    expect(classify("add 3 sets of lateral raises")).toMatchObject({ intent: "addExercise" });
    expect(classify("add 3 sets of 10 reps of lateral raises")).toMatchObject({
      intent: "addExercise",
    });
    expect(classify("add 3x10 triceps pushdown")).toMatchObject({ intent: "addExercise" });
    expect(classify("add 3 sets of 8-12 reps of seated cable row")).toMatchObject({
      intent: "addExercise",
    });
    expect(classify("put in 2 sets of hammer curls")).toMatchObject({ intent: "addExercise" });
  });

  it("does not misclassify other intents as addExercise", () => {
    expect(classify("What weight should I use today?")).toMatchObject({ intent: "weightToday" });
    expect(classify("Can I add 5 lbs to chest press?").intent).not.toBe("addExercise");
    expect(classify("Should I add more weight?").intent).not.toBe("addExercise");
    expect(classify("How am I progressing on leg press?")).toMatchObject({ intent: "progress" });
    expect(classify("Which exercise has improved most?")).toMatchObject({
      intent: "mostImproved",
    });
    expect(classify("Which exercise has stalled?")).toMatchObject({ intent: "stalled" });
    expect(classify("How many workouts did I complete this month?")).toMatchObject({
      intent: "workoutsCount",
    });
    expect(classify("How much cardio did I do?")).toMatchObject({ intent: "cardio" });
    expect(classify("What should I focus on next week?")).toMatchObject({ intent: "focus" });
    expect(classify("hello coach")).toMatchObject({ intent: "general" });
  });
});

describe("extractExerciseSlots", () => {
  it("extracts canonical biceps mapping with default 2x10", () => {
    expect(extractExerciseSlots("add biceps curls")).toEqual({
      name: "Biceps Curl",
      targetSets: 2,
      targetRepsMin: 10,
      targetRepsMax: 10,
      unresolvedMuscle: null,
    });
    expect(extractExerciseSlots("can you add an exercise for biceps")).toEqual({
      name: "Biceps Curl",
      targetSets: 2,
      targetRepsMin: 10,
      targetRepsMax: 10,
      unresolvedMuscle: null,
    });
  });

  it("extracts canonical triceps mapping with default 2x10", () => {
    expect(extractExerciseSlots("include triceps work")).toEqual({
      name: "Triceps Pushdown",
      targetSets: 2,
      targetRepsMin: 10,
      targetRepsMax: 10,
      unresolvedMuscle: null,
    });
    expect(extractExerciseSlots("add triceps")).toEqual({
      name: "Triceps Pushdown",
      targetSets: 2,
      targetRepsMin: 10,
      targetRepsMax: 10,
      unresolvedMuscle: null,
    });
  });

  it("extracts sets-only with default 10 reps", () => {
    expect(extractExerciseSlots("add 3 sets of lateral raises")).toEqual({
      name: "Lateral Raises",
      targetSets: 3,
      targetRepsMin: 10,
      targetRepsMax: 10,
      unresolvedMuscle: null,
    });
  });

  it("extracts explicit sets and reps range", () => {
    expect(extractExerciseSlots("add 3 sets of 8-12 reps of seated cable row")).toEqual({
      name: "Seated Cable Row",
      targetSets: 3,
      targetRepsMin: 8,
      targetRepsMax: 12,
      unresolvedMuscle: null,
    });
  });

  it("extracts NxM shorthand", () => {
    expect(extractExerciseSlots("add 3x10 face pulls")).toEqual({
      name: "Face Pulls",
      targetSets: 3,
      targetRepsMin: 10,
      targetRepsMax: 10,
      unresolvedMuscle: null,
    });
  });

  it("flags unresolved muscle groups with no canonical suggestion", () => {
    expect(extractExerciseSlots("include chest work")).toEqual({
      name: null,
      targetSets: 2,
      targetRepsMin: 10,
      targetRepsMax: 10,
      unresolvedMuscle: "chest",
    });
  });

  it("handles generic add request with no exercise name", () => {
    expect(extractExerciseSlots("add an exercise")).toEqual({
      name: null,
      targetSets: 2,
      targetRepsMin: 10,
      targetRepsMax: 10,
      unresolvedMuscle: null,
    });
  });
});

describe("confirmation helpers", () => {
  it("detects confirmation acceptances", () => {
    const acceptances = [
      "yes",
      "Yes",
      "yeah",
      "yep",
      "yup",
      "sure",
      "ok",
      "okay",
      "do it",
      "confirm",
      "please",
      "yes please",
      "go ahead",
      "sounds good",
      "add it",
    ];
    for (const phrase of acceptances) {
      expect(isConfirmationAccept(phrase)).toBe(true);
    }
    expect(isConfirmationAccept("no")).toBe(false);
    expect(isConfirmationAccept("what weight for chest press")).toBe(false);
  });

  it("detects confirmation declines", () => {
    const declines = [
      "no",
      "No",
      "nope",
      "cancel",
      "don't",
      "dont",
      "never mind",
      "nevermind",
      "no thanks",
      "stop",
    ];
    for (const phrase of declines) {
      expect(isConfirmationDecline(phrase)).toBe(true);
    }
    expect(isConfirmationDecline("yes")).toBe(false);
    expect(isConfirmationDecline("how many workouts")).toBe(false);
  });
});
