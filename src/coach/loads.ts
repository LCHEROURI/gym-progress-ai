import type { HistoryDetail } from "../data/history";
import type { ExerciseLoad } from "./progression";

/**
 * Turns recent session details into per-exercise load history (newest first).
 * Only completed resistance work counts — cardio carries no weight.
 */
export function buildLoads(details: HistoryDetail[]): Record<string, ExerciseLoad[]> {
  const out: Record<string, ExerciseLoad[]> = {};
  for (const d of details) {
    const symptoms = {
      pain: d.session.painReported,
      dizziness: d.session.dizzinessReported,
      shortnessOfBreath: d.session.shortnessOfBreathReported,
    };
    for (const e of d.exercises) {
      if (e.targetSets === null) continue;
      const exerciseSets = d.sets
        .filter((s) => s.exerciseKey === e.exerciseKey && s.completed)
        .sort((a, b) => a.setNumber - b.setNumber);
      const repsPerSet = exerciseSets.map((s) => s.reps);
      const weight =
        typeof e.weightUsed === "number" && e.weightUsed > 0
          ? e.weightUsed
          : (exerciseSets[0]?.weight ?? e.weightUsed);
      const hasRecordedWork =
        (e.completed && weight !== null) ||
        (typeof weight === "number" && weight > 0) ||
        repsPerSet.length > 0;
      if (!hasRecordedWork || weight === null) continue;
      const effectiveReps =
        repsPerSet.length > 0
          ? repsPerSet
          : d.sets.length === 0 && typeof weight === "number" && weight > 0
            ? Array.from({ length: e.targetSets ?? 2 }, () => e.targetRepsMin ?? 10)
            : [];
      const list = out[e.exerciseKey] ?? [];
      list.push({
        weight,
        repsPerSet: effectiveReps,
        difficulty: e.difficulty,
        painStatus: e.painStatus,
        symptoms,
      });
      out[e.exerciseKey] = list;
    }
  }
  return out;
}
