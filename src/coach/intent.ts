export type CoachIntent =
  | "nextWorkout"
  | "weightToday"
  | "progress"
  | "mostImproved"
  | "stalled"
  | "workoutsCount"
  | "cardio"
  | "focus"
  | "general";

export interface KnownExercise {
  key: string;
  name: string;
}

export interface ClassifiedQuestion {
  intent: CoachIntent;
  exerciseKey: string | null;
}

/**
 * Pipeline step 1 — intent + target exercise from the question, in code.
 * Keyword-based on purpose: deterministic, testable, no model round trip.
 */
export function classifyQuestion(input: {
  question: string;
  knownExercises: KnownExercise[];
}): ClassifiedQuestion {
  const q = input.question.toLowerCase();
  const hit = input.knownExercises.find(
    (e) => q.includes(e.name.toLowerCase()) || q.includes(e.key.replace(/-/g, " ")),
  );
  const exerciseKey = hit?.key ?? null;

  // Effort-aware next-workout suggestions (chips.ts) — checked first so
  // "ready to progress" does not fall into the generic progress route.
  if (
    /next workout|ease off|deload|lighter|harder|same weights|felt (easy|good|hard)/.test(
      q,
    )
  ) {
    return { intent: "nextWorkout", exerciseKey };
  }
  if (/stall/.test(q)) return { intent: "stalled", exerciseKey };
  if (
    /(most|biggest).{0,24}(improv|gain|progress)/.test(q) ||
    /(improv|gain|progress).{0,24}(most|biggest)/.test(q)
  ) {
    return { intent: "mostImproved", exerciseKey };
  }
  if (/how many workouts|workouts (did|this|in)|workout count/.test(q)) {
    return { intent: "workoutsCount", exerciseKey };
  }
  if (/cardio|minutes/.test(q)) return { intent: "cardio", exerciseKey };
  if (/focus|next week/.test(q)) return { intent: "focus", exerciseKey };
  if (/what weight|weight should|weight (do|to) use/.test(q)) {
    return { intent: "weightToday", exerciseKey };
  }
  if (/improv|progress|how am i/.test(q)) return { intent: "progress", exerciseKey };
  return { intent: "general", exerciseKey };
}
