import type {
  ExerciseSession,
  WorkoutSession,
  WorkoutSet,
} from "../domain/session";
import type { WorkoutTemplate } from "../domain/templates";
import { buildEffectiveExercises } from "../domain/effectiveTemplate";
import type { Profile } from "../data/settings";

export interface LoggedSet extends WorkoutSet {
  exerciseKey: string;
}

export interface CompletionSummary {
  exercisesDone: number;
  exercisesTotal: number;
  strengthSets: number;
  cardioMinutes: number;
  durationMinutes: number;
}

/**
 * Deterministic completion math — every number here is computed in code from
 * recorded data, never estimated (AGENTS.md rule 11).
 */
export function buildCompletionSummary(input: {
  session: WorkoutSession;
  template: WorkoutTemplate;
  exercises: ExerciseSession[];
  sets: LoggedSet[];
  completedAt?: Date;
  profile?: Pick<Profile, "extraExercises"> | null;
}): CompletionSummary {
  const effectiveExercises = buildEffectiveExercises(input.template, input.profile);
  const kindByKey = new Map(effectiveExercises.map((e) => [e.key, e.kind]));
  const strengthKeys = new Set(
    effectiveExercises.filter((e) => e.kind === "resistance").map((e) => e.key),
  );

  const done = input.exercises.filter((e) => e.completed);
  const strengthSets = input.sets.filter(
    (s) => strengthKeys.has(s.exerciseKey) && s.completed,
  ).length;
  const cardioMinutes = done
    .filter((e) => kindByKey.get(e.exerciseKey) === "cardio")
    .reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);

  const start = input.session.startedAt ?? input.session.createdAt;
  const end =
    input.completedAt ?? input.session.completedAt ?? input.session.updatedAt;
  const durationMinutes = Math.max(
    0,
    Math.round((end.getTime() - start.getTime()) / 60000),
  );

  return {
    exercisesDone: done.length,
    exercisesTotal: input.exercises.length,
    strengthSets,
    cardioMinutes,
    durationMinutes,
  };
}
