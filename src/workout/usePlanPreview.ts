/**
 * Pre-workout plan preview: the last completed weight per exercise plus the
 * deterministic next-weight suggestion (src/coach/progression.ts — never
 * Gemini), so plan cards can show "reps @ weight" and the suggested next
 * weight before the workout starts.
 */
import { useEffect, useState } from "react";
import type { Firestore } from "firebase/firestore";
import type { WorkoutTemplate } from "../domain/templates";
import { fetchPreviousWeights, type RepoCtx } from "../data/session-repository";
import { fetchRecentDetails } from "../data/history";
import { buildLoads } from "../coach/loads";
import { recommendWeight } from "../coach/progression";

export interface NextWeight {
  action: "increase" | "keep" | "decrease";
  suggestedWeight: number;
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
}): PlanPreview {
  const [preview, setPreview] = useState<PlanPreview>(EMPTY);
  const increments = input.machineIncrements;

  useEffect(() => {
    let cancelled = false;
    const ctx: RepoCtx = { db: input.db };
    const keys = input.template.exercises.map((e) => e.key);
    Promise.all([
      fetchPreviousWeights(ctx, input.uid, keys).catch(
        (): Record<string, number | null> => ({}),
      ),
      input.coachEnabled === false
        ? Promise.resolve([])
        : fetchRecentDetails(ctx, input.uid, 3).catch(() => []),
    ])
      .then(([previousWeights, recent]) => {
        if (cancelled) return;
        const loads = buildLoads(recent);
        const nextWeights: Record<string, NextWeight | undefined> = {};
        for (const t of input.template.exercises) {
          if (t.kind !== "resistance") continue;
          const prev = previousWeights[t.key] ?? null;
          // No history, no suggestion — never fabricate numbers.
          if (prev === null) continue;
          const r = recommendWeight({
            loads: loads[t.key] ?? [],
            targetSets: t.targetSets ?? 1,
            targetRepsMin: t.targetRepsMin ?? 10,
            increment: increments?.[t.key] ?? 5,
          });
          nextWeights[t.key] = {
            action: r.action,
            suggestedWeight: r.suggestedWeight,
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
  }, [input.db, input.uid, input.template, input.coachEnabled, increments]);

  return preview;
}
