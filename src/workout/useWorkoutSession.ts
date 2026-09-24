import { useCallback, useState } from "react";
import type { Firestore } from "firebase/firestore";
import type { ExerciseSession, WorkoutSession, WorkoutSet } from "../domain/session";
import type { WorkoutTemplate } from "../domain/templates";
import {
  fetchPreviousWeights,
  logSet as persistSet,
  saveExercise,
  saveSession,
  startSession,
  type RepoCtx,
} from "../data/session-repository";
import { fetchRecentDetails } from "../data/history";
import { buildLoads } from "../coach/loads";
import { recommendWeight, type Recommendation } from "../coach/progression";
import {
  buildRecommendationRecord,
  newRecommendationId,
  recordDecision,
  saveRecommendation,
} from "../coach/recommendations";
import type { LoggedSet } from "./summary";

export interface CoachSuggestion {
  id: string;
  recommendation: Recommendation;
  reason: string;
}
import type { SyncState } from "../data/useSyncStatus";

export interface WorkoutFlow {
  phase: "today" | "active" | "complete";
  session: WorkoutSession | null;
  exercises: ExerciseSession[];
  sets: LoggedSet[];
  error: string | null;
  /** initialWeights: tapped suggestion picks, keyed by exercise key. */
  start: (initialWeights?: Record<string, number>) => Promise<void>;
  patchExercise: (exerciseKey: string, patch: Partial<ExerciseSession>) => Promise<void>;
  patchSession: (patch: Partial<WorkoutSession>) => Promise<void>;
  logSet: (exerciseKey: string, set: WorkoutSet) => Promise<void>;
  complete: () => Promise<void>;
  reset: () => void;
  recommendations: Record<string, CoachSuggestion>;
  decide: (
    exerciseKey: string,
    decision: { accepted: boolean; finalWeightChosen: number | null },
  ) => Promise<void>;
}

let counter = 0;
function newSessionId(): string {
  counter += 1;
  return `s${Date.now().toString(36)}${counter}`;
}

export function useWorkoutSession(input: {
  db: Firestore;
  uid: string;
  template: WorkoutTemplate;
  scheduledDate: string;
  syncState?: SyncState;
  coachEnabled?: boolean;
  weightUnit?: "lb" | "kg";
}): WorkoutFlow {
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [exercises, setExercises] = useState<ExerciseSession[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sets, setSets] = useState<LoggedSet[]>([]);
  const [recommendations, setRecommendations] = useState<Record<string, CoachSuggestion>>({});
  const ctx: RepoCtx = { db: input.db };

  const start = useCallback(async (initialWeights?: Record<string, number>) => {
    try {
      setError(null);
      const keys = input.template.exercises.map((e) => e.key);
      const [previousWeights, recent] = await Promise.all([
        fetchPreviousWeights(ctx, input.uid, keys),
        fetchRecentDetails(ctx, input.uid, 3).catch(() => []),
      ]);
      const created = await startSession(ctx, {
        sessionId: newSessionId(),
        uid: input.uid,
        template: input.template,
        scheduledDate: input.scheduledDate,
        previousWeights,
      });
      const built = input.template.exercises.map((t) =>
        buildExercise(
          t,
          input.template,
          previousWeights[t.key] ?? null,
          input.weightUnit ?? "lb",
          initialWeights?.[t.key],
        ),
      );
      const loads = buildLoads(recent);
      const suggestions: Record<string, CoachSuggestion> = {};
      for (const t of input.coachEnabled === false ? [] : input.template.exercises) {
        if (t.kind !== "resistance") continue;
        const recommendation = recommendWeight({
          loads: loads[t.key] ?? [],
          targetSets: t.targetSets ?? 1,
          targetRepsMin: t.targetRepsMin ?? 10,
          increment: 5,
        });
        const id = newRecommendationId();
        await saveRecommendation(
          ctx,
          input.uid,
          id,
          buildRecommendationRecord({
            recommendation,
            exerciseKey: t.key,
            date: input.scheduledDate,
            model: "deterministic",
            promptVersion: "none",
          }),
        );
        suggestions[t.key] = { id, recommendation, reason: recommendation.reason };
      }
      setRecommendations(suggestions);
      setSession(created);
      setExercises(built);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the workout.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input.db, input.uid, input.template, input.scheduledDate]);

  const patchExercise = useCallback(
    async (exerciseKey: string, patch: Partial<ExerciseSession>) => {
      const current = exercises.find((e) => e.exerciseKey === exerciseKey);
      if (!current || !session) return;
      try {
        const merged = await saveExercise(ctx, {
          uid: input.uid,
          sessionId: session.id,
          current,
          patch,
        });
        setExercises((list) =>
          list.map((e) => (e.exerciseKey === exerciseKey ? merged : e)),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save your entry.");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [exercises, session, input.db, input.uid],
  );

  const patchSession = useCallback(
    async (patch: Partial<WorkoutSession>) => {
      if (!session) return;
      try {
        const merged = await saveSession(ctx, { uid: input.uid, current: session, patch });
        setSession(merged);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save your entry.");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session, input.db, input.uid],
  );

  const logSet = useCallback(
    async (exerciseKey: string, set: WorkoutSet) => {
      if (!session) return;
      try {
        await persistSet(ctx, {
          uid: input.uid,
          sessionId: session.id,
          exerciseKey,
          set,
        });
        setSets((list) => [...list, { ...set, exerciseKey }]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save your set.");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session, input.db, input.uid],
  );

  const complete = useCallback(async () => {
    await patchSession({ status: "completed", completedAt: new Date() });
  }, [patchSession]);

  const decide = useCallback(
    async (
      exerciseKey: string,
      decision: { accepted: boolean; finalWeightChosen: number | null },
    ) => {
      const entry = recommendations[exerciseKey];
      if (!entry) return;
      try {
        await recordDecision(ctx, input.uid, entry.id, decision);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save your decision.");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recommendations, input.db, input.uid],
  );

  const reset = useCallback(() => {
    setSession(null);
    setExercises([]);
    setSets([]);
    setRecommendations({});
    setError(null);
  }, []);

  return {
    phase: session ? (session.status === "completed" ? "complete" : "active") : "today",
    session,
    exercises,
    sets,
    error,
    start,
    patchExercise,
    patchSession,
    logSet,
    complete,
    reset,
    recommendations,
    decide,
  };
}

import { buildExerciseSession } from "../domain/session";

function buildExercise(
  t: WorkoutTemplate["exercises"][number],
  template: WorkoutTemplate,
  previousWeight: number | null,
  unit: "lb" | "kg",
  initialWeight?: number,
): ExerciseSession {
  return buildExerciseSession({
    template,
    order: t.order,
    previousWeight,
    initialWeight,
    weightUnit: t.kind === "resistance" ? unit : null,
  });
}
