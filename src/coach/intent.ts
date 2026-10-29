export type CoachIntent =
  | "nextWorkout"
  | "weightToday"
  | "progress"
  | "mostImproved"
  | "stalled"
  | "workoutsCount"
  | "cardio"
  | "focus"
  | "addExercise"
  | "general";

export interface KnownExercise {
  key: string;
  name: string;
}

export interface ExerciseSlots {
  name: string | null;
  targetSets: number;
  targetRepsMin: number;
  targetRepsMax: number;
  unresolvedMuscle?: string | null;
}

export interface ClassifiedQuestion {
  intent: CoachIntent;
  exerciseKey: string | null;
  slots?: ExerciseSlots;
}

export function toTitleCase(str: string): string {
  return str
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function isConfirmationAccept(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/^[!.,?\s]+|[!.,?\s]+$/g, "");
  return /^(yes|yeah|yep|yup|sure|ok|okay|do it|confirm|please|yes please|go ahead|sounds good|add it)(,?\s*(please|do it|go ahead|sounds good|add it))?$/i.test(
    t,
  );
}

export function isConfirmationDecline(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/^[!.,?\s]+|[!.,?\s]+$/g, "");
  return /^(no|nope|cancel|don't|dont|never mind|nevermind|no thanks|stop)$/i.test(t);
}

export function isAddExerciseQuestion(q: string): boolean {
  const lower = q.toLowerCase();
  // If asking about adding weight, that's not adding an exercise
  if (
    /\b(add|increase)\s+(more\s+)?(weight|load|lbs?|pounds?|kg|kilos?)\b/.test(lower) ||
    /\badd\s+\d+\s*(lbs?|pounds?|kg|kilos?)\b/.test(lower) ||
    /add\s+(more\s+)?weight\s+to\b/.test(lower)
  ) {
    return false;
  }
  return /\b(add|include|put in|insert|append)\b/.test(lower);
}

export function extractExerciseSlots(question: string): ExerciseSlots {
  let qClean = question.trim();

  let targetSets = 2;
  let targetRepsMin = 10;
  let targetRepsMax = 10;

  // 1. Check for "3x10", "3 x 10", "3x8-12", "3 x 8 to 12"
  const xMatch = qClean.match(
    /\b(\d+)\s*x\s*(\d+)(?:\s*(?:-|to)\s*(\d+))?\s*(?:reps?)?\b/i,
  );
  if (xMatch) {
    targetSets = parseInt(xMatch[1], 10);
    targetRepsMin = parseInt(xMatch[2], 10);
    targetRepsMax = xMatch[3] ? parseInt(xMatch[3], 10) : targetRepsMin;
    qClean = qClean.replace(xMatch[0], " ");
  } else {
    // 2. Check for "3 sets of 10 reps", "3 sets of 8-12 reps", "3 sets of 10"
    const setsRepsMatch = qClean.match(
      /\b(\d+)\s*sets?(?:\s*of)?\s*(\d+)(?:\s*(?:-|to)\s*(\d+))?\s*(?:reps?)?\b/i,
    );
    if (setsRepsMatch) {
      targetSets = parseInt(setsRepsMatch[1], 10);
      targetRepsMin = parseInt(setsRepsMatch[2], 10);
      targetRepsMax = setsRepsMatch[3] ? parseInt(setsRepsMatch[3], 10) : targetRepsMin;
      qClean = qClean.replace(setsRepsMatch[0], " ");
    } else {
      // 3. Check for sets only: "3 sets of", "3 sets"
      const setsMatch = qClean.match(/\b(\d+)\s*sets?(?:\s*of)?\b/i);
      if (setsMatch) {
        targetSets = parseInt(setsMatch[1], 10);
        qClean = qClean.replace(setsMatch[0], " ");
      }
      // 4. Check for reps only: "10 reps", "8-12 reps", "10 reps of"
      const repsMatch = qClean.match(
        /\b(\d+)(?:\s*(?:-|to)\s*(\d+))?\s*reps?(?:\s*of)?\b/i,
      );
      if (repsMatch) {
        targetRepsMin = parseInt(repsMatch[1], 10);
        targetRepsMax = repsMatch[2] ? parseInt(repsMatch[2], 10) : targetRepsMin;
        qClean = qClean.replace(repsMatch[0], " ");
      }
    }
  }

  // Clamp within schema limits
  targetSets = Math.min(20, Math.max(1, targetSets));
  targetRepsMin = Math.min(200, Math.max(1, targetRepsMin));
  targetRepsMax = Math.min(200, Math.max(1, targetRepsMax));
  if (targetRepsMax < targetRepsMin) {
    const temp = targetRepsMin;
    targetRepsMin = targetRepsMax;
    targetRepsMax = temp;
  }

  // Remove leading intent phrases
  qClean = qClean.replace(
    /^(?:can you\s+)?(?:could you\s+)?(?:please\s+)?(?:i want to\s+)?(?:let'?s\s+)?(?:add|include|put in|insert|append)\b/i,
    " ",
  );

  // Remove destination phrases
  qClean = qClean.replace(/\b(?:to|into|in)\s+(?:my\s+|the\s+|every\s+)?workouts?\b/gi, " ");
  qClean = qClean.replace(/\b(?:to|in)\s+every\s+workout\b/gi, " ");
  qClean = qClean.replace(/\b(?:as\s+an?\s+)?extra\s+exercises?\b/gi, " ");
  qClean = qClean.replace(/\bto\s+my\s+plan\b/gi, " ");
  qClean = qClean.replace(/\bevery\s+workout\b/gi, " ");

  // Remove filler phrases
  qClean = qClean.replace(/\b(?:an?\s+)?exercises?\s+for\b/gi, " ");
  qClean = qClean.replace(/\b(?:an?\s+)?exercises?\b/gi, " ");
  qClean = qClean.replace(/\b(?:some|a|an|the)\b/gi, " ");

  // Clean edges and punctuation
  qClean = qClean
    .replace(/^[,\s.?!]+|[,\s.?!]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  qClean = qClean.replace(/^(?:of|for|with)\s+/i, "").trim();

  // Strip trailing "work" (e.g. "triceps work" -> "triceps", "chest work" -> "chest")
  const withoutWork = qClean.replace(/\s+work$/i, "").trim();
  const lower = withoutWork.toLowerCase();

  // Canonical mapping from Settings screen suggestions:
  // biceps -> "Biceps Curl"
  // triceps -> "Triceps Pushdown"
  if (
    /\b(biceps?|bicep\s*curls?|curls?)\b/i.test(lower) &&
    !/\b(leg|hamstring)\b/i.test(lower)
  ) {
    return {
      name: "Biceps Curl",
      targetSets,
      targetRepsMin,
      targetRepsMax,
      unresolvedMuscle: null,
    };
  }

  if (/\b(triceps?|tricep\s*pushdowns?|pushdowns?)\b/i.test(lower)) {
    return {
      name: "Triceps Pushdown",
      targetSets,
      targetRepsMin,
      targetRepsMax,
      unresolvedMuscle: null,
    };
  }

  // Muscle groups with no clear canonical match
  const UNRESOLVED_MUSCLES = [
    "chest",
    "shoulder",
    "shoulders",
    "back",
    "legs",
    "leg",
    "quads",
    "quad",
    "hamstrings",
    "hamstring",
    "calves",
    "calf",
    "glutes",
    "glute",
    "abs",
    "ab",
    "core",
    "arms",
    "arm",
    "forearms",
    "forearm",
    "traps",
    "trap",
    "lats",
    "lat",
  ];

  if (UNRESOLVED_MUSCLES.includes(lower)) {
    return {
      name: null,
      targetSets,
      targetRepsMin,
      targetRepsMax,
      unresolvedMuscle: lower.replace(/s$/, ""),
    };
  }

  if (!withoutWork) {
    return {
      name: null,
      targetSets,
      targetRepsMin,
      targetRepsMax,
      unresolvedMuscle: null,
    };
  }

  return {
    name: toTitleCase(withoutWork),
    targetSets,
    targetRepsMin,
    targetRepsMax,
    unresolvedMuscle: null,
  };
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
  if (isAddExerciseQuestion(q)) {
    const slots = extractExerciseSlots(input.question);
    return { intent: "addExercise", exerciseKey, slots };
  }
  if (/improv|progress|how am i/.test(q)) return { intent: "progress", exerciseKey };
  return { intent: "general", exerciseKey };
}
