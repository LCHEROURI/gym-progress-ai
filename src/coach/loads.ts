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
      if (!e.completed || e.weightUsed === null) continue;
      const repsPerSet = d.sets
        .filter((s) => s.exerciseKey === e.exerciseKey && s.completed)
        .sort((a, b) => a.setNumber - b.setNumber)
        .map((s) => s.reps);
      const list = out[e.exerciseKey] ?? [];
      list.push({
        weight: e.weightUsed,
        repsPerSet,
        difficulty: e.difficulty,
        painStatus: e.painStatus,
        symptoms,
      });
      out[e.exerciseKey] = list;
    }
  }
  return out;
}
