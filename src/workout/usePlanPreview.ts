/**
 * Pre-workout plan preview: the last completed weight per exercise plus the
 * deterministic next-weight suggestion (src/coach/progression.ts — never
 * Gemini), so plan cards can show "reps @ weight" and the suggested next
 * weight before the workout starts.
 */
import { useEffect, useState } from "react";
import type { Firestore } from "firebase/firestore";
import type { WorkoutTemplate } from "../domain/templates";
import { buildEffectiveExercises } from "../domain/effectiveTemplate";
import type { Profile } from "../data/settings";
import { fetchPreviousWeights, type RepoCtx } from "../data/session-repository";
import { fetchRecentDetails } from "../data/history";
import { buildLoads } from "../coach/loads";
import { recommendWeight } from "../coach/progression";

export interface NextWeight {
  action: "increase" | "keep" | "decrease";
  suggestedWeight: number;
  suggestedReps?: number;
  previousReps?: number[];
  lastDifficulty?: "easy" | "good" | "hard" | null;
}

export interface PlanPreview {
  previousWeights: Record<string, number | null>;
  nextWeights: Record<string, NextWeight | undefined>;
}

const EMPTY: PlanPreview = { previousWeights: {}, nextWeights: {} };

export function usePlanPreview(input: {
  db: Firestore;
  uid: string;
  template: WorkoutTemplate;
  coachEnabled?: boolean;
  machineIncrements?: Record<string, number>;
  profile?: Pick<Profile, "extraExercises"> | null;
}): PlanPreview {
  const [preview, setPreview] = useState<PlanPreview>(EMPTY);
  const increments = input.machineIncrements;

  useEffect(() => {
    let cancelled = false;
    const ctx: RepoCtx = { db: input.db };
    const effectiveExercises = buildEffectiveExercises(input.template, input.profile);
    const keys = effectiveExercises.map((e) => e.key);
    Promise.all([
      fetchPreviousWeights(ctx, input.uid, keys).catch(
        (): Record<string, number | null> => ({}),
      ),
      fetchRecentDetails(ctx, input.uid, 10).catch(() => []),
    ])
      .then(([rawPreviousWeights, recent]) => {
        if (cancelled) return;
        const loads = buildLoads(recent);
        const previousWeights: Record<string, number | null> = { ...rawPreviousWeights };
        const nextWeights: Record<string, NextWeight | undefined> = {};
        for (const t of effectiveExercises) {
          if (t.kind !== "resistance") continue;
          const fromStats = previousWeights[t.key] ?? null;
          const fromHistoryWithSets = loads[t.key]?.find((l) => l.repsPerSet.length > 0)?.weight ?? null;
          const prev = fromStats ?? fromHistoryWithSets;
          previousWeights[t.key] = prev;
          // No history, no suggestion — never fabricate numbers.
          if (prev === null) continue;
          if (input.coachEnabled === false) continue;
          const r = recommendWeight({
            loads: loads[t.key] ?? [],
            targetSets: t.targetSets ?? 1,
            targetRepsMin: t.targetRepsMin ?? 10,
            targetRepsMax: t.targetRepsMax ?? t.targetRepsMin ?? 10,
            increment: increments?.[t.key] ?? 5,
          });
          nextWeights[t.key] = {
            action: r.action,
            suggestedWeight: r.suggestedWeight,
            suggestedReps: r.suggestedReps,
            previousReps: r.previousReps,
            lastDifficulty: r.lastDifficulty,
          };
        }
        setPreview({ previousWeights, nextWeights });
      })
      .catch(() => {
        if (!cancelled) setPreview(EMPTY);
      });
    return () => {
      cancelled = true;
    };
  }, [input.db, input.uid, input.template, input.coachEnabled, increments, input.profile]);

  return preview;
}
