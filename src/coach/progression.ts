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

export function recommendWeight(input: {
  loads: ExerciseLoad[]; // completed sessions, newest first
  targetSets: number;
  targetRepsMin: number;
  increment: number;
}): Recommendation {
  const { loads, targetSets, targetRepsMin, increment } = input;
  const latest = loads[0];

  const factsBase = {
    targetSets,
    targetRepsMin,
    increment,
    historyLength: loads.length,
    lastRepsPerSet: latest?.repsPerSet ?? [],
    lastDifficulty: latest?.difficulty ?? null,
  };

  if (!latest) {
    return {
      action: "keep",
      previousWeight: null,
      suggestedWeight: 0,
      reason: "Not enough history yet — start light and record how each set feels.",
      blockedBySafety: false,
      contextFacts: { ...factsBase, rule: "insufficient-data" },
    };
  }

  const previousWeight = latest.weight;
  const keep = (reason: string, rule: string, blocked = false): Recommendation => ({
    action: "keep",
    previousWeight,
    suggestedWeight: previousWeight,
    reason,
    blockedBySafety: blocked,
    contextFacts: { ...factsBase, lastWeight: previousWeight, rule },
  });

  if (hasSymptoms(latest)) {
    return keep(SAFETY_MESSAGE, "safety-gate", true);
  }

  const misses = loads.slice(0, 2).filter((l) => !hitTargets(l, targetSets, targetRepsMin));
  if (misses.length >= 2) {
    return {
      action: "decrease",
      previousWeight,
      suggestedWeight: Math.max(0, previousWeight - increment),
      reason: `You missed the target repetitions in your last ${misses.length} sessions. A small step back will help you finish all sets at target again.`,
      blockedBySafety: false,
      contextFacts: { ...factsBase, lastWeight: previousWeight, rule: "repeated-miss" },
    };
  }

  if (!hitTargets(latest, targetSets, targetRepsMin)) {
    return keep(
      "You did not quite hit the target repetitions last time. Keep the same weight and finish every set at target.",
      "missed-reps",
    );
  }

  if (latest.difficulty === "hard") {
    return keep(
      "You rated that resistance as hard. Keep the same weight until it feels comfortable.",
      "rated-hard",
    );
  }

  const recentIncrease =
    loads.length > 1 && latest.weight > (loads[1]?.weight ?? latest.weight);
  if (recentIncrease && latest.difficulty !== "easy") {
    return keep(
      "You just increased this weight. Keep it until it feels comfortable.",
      "recent-increase",
    );
  }

  if (latest.painStatus === "mild") {
    return keep(
      "You reported mild discomfort. Keep the same weight and focus on form.",
      "mild-pain",
    );
  }

  return {
    action: "increase",
    previousWeight,
    suggestedWeight: previousWeight + increment,
    reason: "You completed all sets at the target repetitions and rated the resistance as comfortable. A small increase may be reasonable.",
    blockedBySafety: false,
    contextFacts: { ...factsBase, lastWeight: previousWeight, rule: "progress" },
  };
}
