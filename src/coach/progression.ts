/**
 * Deterministic conservative-progression engine (PROJECT-SPEC "weight increase
 * logic", AI-SAFETY "conservative progression rules"). Gemini never computes
 * these numbers — it may only rephrase the reason below.
 */

export interface ExerciseLoad {
  weight: number;
  repsPerSet: number[];
  difficulty: "easy" | "good" | "hard" | null;
  painStatus: "none" | "mild" | "stopped" | null;
  symptoms: { pain: boolean; dizziness: boolean; shortnessOfBreath: boolean };
}

export interface Recommendation {
  action: "increase" | "keep" | "decrease";
  previousWeight: number | null;
  suggestedWeight: number;
  previousReps?: number[];
  suggestedReps?: number;
  targetSets?: number;
  lastDifficulty?: "easy" | "good" | "hard" | null;
  reason: string;
  blockedBySafety: boolean;
  contextFacts: Record<string, unknown>;
}

export const SAFETY_MESSAGE = "Do not increase resistance based on this session.";

function hitTargets(load: ExerciseLoad, targetSets: number, targetRepsMin: number): boolean {
  return (
    load.repsPerSet.length >= targetSets &&
    load.repsPerSet.every((r) => r >= targetRepsMin)
  );
}

function hasSymptoms(load: ExerciseLoad): boolean {
  return (
    load.symptoms.pain ||
    load.symptoms.dizziness ||
    load.symptoms.shortnessOfBreath ||
    load.painStatus === "stopped"
  );
}

function formatRepsLabel(repsPerSet: number[]): string {
  return repsPerSet.length > 0 ? `${repsPerSet.join(", ")} reps` : "no recorded reps";
}

export function recommendWeight(input: {
  loads: ExerciseLoad[]; // completed sessions, newest first
  targetSets: number;
  targetRepsMin: number;
  targetRepsMax?: number | null;
  increment: number;
}): Recommendation {
  const { loads, targetSets, targetRepsMin, targetRepsMax, increment } = input;
  const latest = loads[0];
  const previousReps = latest?.repsPerSet ?? [];
  const lastDifficulty = latest?.difficulty ?? null;
  const maxRepsTarget =
    targetRepsMax && targetRepsMax > targetRepsMin ? targetRepsMax : targetRepsMin;

  const factsBase = {
    targetSets,
    targetRepsMin,
    targetRepsMax: maxRepsTarget,
    increment,
    historyLength: loads.length,
    lastRepsPerSet: previousReps,
    lastDifficulty,
    lifterProfile: "active-healthy-73yo-male-hypertrophy-fitness",
  };

  if (!latest) {
    return {
      action: "keep",
      previousWeight: null,
      suggestedWeight: 0,
      previousReps: [],
      suggestedReps: targetRepsMin,
      targetSets,
      lastDifficulty: null,
      reason: `Not enough history yet — start with a comfortable weight for ${targetSets} sets of ${targetRepsMin} controlled reps and record how each set feels.`,
      blockedBySafety: false,
      contextFacts: { ...factsBase, suggestedReps: targetRepsMin, rule: "insufficient-data" },
    };
  }

  const previousWeight = latest.weight;
  const repsLabel = formatRepsLabel(previousReps);
  const keep = (
    reason: string,
    rule: string,
    blocked = false,
    suggestedReps = targetRepsMin,
  ): Recommendation => ({
    action: "keep",
    previousWeight,
    suggestedWeight: previousWeight,
    previousReps,
    suggestedReps,
    targetSets,
    lastDifficulty,
    reason,
    blockedBySafety: blocked,
    contextFacts: {
      ...factsBase,
      lastWeight: previousWeight,
      suggestedWeight: previousWeight,
      suggestedReps,
      rule,
    },
  });

  if (hasSymptoms(latest)) {
    return keep(SAFETY_MESSAGE, "safety-gate", true, targetRepsMin);
  }

  const misses = loads.slice(0, 2).filter((l) => !hitTargets(l, targetSets, targetRepsMin));
  if (misses.length >= 2) {
    const suggestedWeight = Math.max(0, previousWeight - increment);
    return {
      action: "decrease",
      previousWeight,
      suggestedWeight,
      previousReps,
      suggestedReps: targetRepsMin,
      targetSets,
      lastDifficulty,
      reason: `You missed the target repetitions in your last ${misses.length} sessions (last: ${previousWeight} lb for ${repsLabel}). Step back to ${suggestedWeight} lb for ${targetSets} sets of ${targetRepsMin} controlled reps to protect your joints and rebuild muscle-building volume.`,
      blockedBySafety: false,
      contextFacts: {
        ...factsBase,
        lastWeight: previousWeight,
        suggestedWeight,
        suggestedReps: targetRepsMin,
        rule: "repeated-miss",
      },
    };
  }

  if (!hitTargets(latest, targetSets, targetRepsMin)) {
    const diffNote = lastDifficulty ? ` (rated ${lastDifficulty})` : "";
    return keep(
      `You did not quite hit the target repetitions last time (${repsLabel} at ${previousWeight} lb${diffNote}). Keep ${previousWeight} lb and aim for ${targetSets} sets of ${targetRepsMin} controlled reps to build muscle mass safely before adding weight.`,
      "missed-reps",
      false,
      targetRepsMin,
    );
  }

  if (latest.difficulty === "hard") {
    return keep(
      `You rated that resistance (${previousWeight} lb for ${repsLabel}) as hard. For an active 73-year-old building muscle mass with healthy joint recovery, keep ${previousWeight} lb and perform ${targetSets} sets of ${targetRepsMin} smooth reps until it feels comfortable.`,
      "rated-hard",
      false,
      targetRepsMin,
    );
  }

  const recentIncrease =
    loads.length > 1 && latest.weight > (loads[1]?.weight ?? latest.weight);
  if (recentIncrease && latest.difficulty !== "easy") {
    const consolidateReps =
      maxRepsTarget > targetRepsMin ? maxRepsTarget : Math.min(targetRepsMin + 2, 12);
    return keep(
      `You just increased this weight to ${previousWeight} lb (${repsLabel}). Keep ${previousWeight} lb and aim for ${targetSets} sets of ${consolidateReps} controlled reps until it feels comfortable so your tendons and muscles adapt.`,
      "recent-increase",
      false,
      consolidateReps,
    );
  }

  if (latest.painStatus === "mild") {
    return keep(
      `You reported mild discomfort at ${previousWeight} lb (${repsLabel}). Keep ${previousWeight} lb for ${targetSets} sets of ${targetRepsMin} smooth, pain-free reps and focus on form.`,
      "mild-pain",
      false,
      targetRepsMin,
    );
  }

  const suggestedWeight = previousWeight + increment;
  const suggestedReps =
    latest.difficulty === "easy" && maxRepsTarget > targetRepsMin
      ? maxRepsTarget
      : targetRepsMin;
  const effortWord = latest.difficulty === "easy" ? "easy" : "comfortable";

  return {
    action: "increase",
    previousWeight,
    suggestedWeight,
    previousReps,
    suggestedReps,
    targetSets,
    lastDifficulty,
    reason: `You completed ${repsLabel} at ${previousWeight} lb and rated the resistance as ${effortWord}. For steady muscle mass building at 73, a small increase may be reasonable: try ${suggestedWeight} lb for ${targetSets} sets of ${suggestedReps} controlled reps.`,
    blockedBySafety: false,
    contextFacts: {
      ...factsBase,
      lastWeight: previousWeight,
      suggestedWeight,
      suggestedReps,
      rule: "progress",
    },
  };
}
