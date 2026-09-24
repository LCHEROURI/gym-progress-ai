import { useCallback, useState } from "react";
import type { Firestore } from "firebase/firestore";
import type { ExerciseSession, WorkoutSession } from "../domain/session";
import type { WorkoutTemplate } from "../domain/templates";
import {
  fetchPreviousWeights,
  saveExercise,
  saveSession,
  startSession,
  type RepoCtx,
} from "../data/session-repository";
import type { SyncState } from "../data/useSyncStatus";

export interface WorkoutFlow {
  phase: "today" | "active";
  session: WorkoutSession | null;
  exercises: ExerciseSession[];
  error: string | null;
  start: () => Promise<void>;
  patchExercise: (exerciseKey: string, patch: Partial<ExerciseSession>) => Promise<void>;
  patchSession: (patch: Partial<WorkoutSession>) => Promise<void>;
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
}): WorkoutFlow {
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [exercises, setExercises] = useState<ExerciseSession[]>([]);
  const [error, setError] = useState<string | null>(null);
  const ctx: RepoCtx = { db: input.db };

  const start = useCallback(async () => {
    try {
      setError(null);
      const keys = input.template.exercises.map((e) => e.key);
      const previousWeights = await fetchPreviousWeights(ctx, input.uid, keys);
      const created = await startSession(ctx, {
        sessionId: newSessionId(),
        uid: input.uid,
        template: input.template,
        scheduledDate: input.scheduledDate,
        previousWeights,
      });
      const built = input.template.exercises.map((t, i) => {
        const orders = input.template.exercises.map((e) => e.order);
        void orders;
        void i;
        return buildExercise(t, input.template, previousWeights[t.key] ?? null);
      });
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

  return {
    phase: session ? "active" : "today",
    session,
    exercises,
    error,
    start,
    patchExercise,
    patchSession,
  };
}

import { buildExerciseSession } from "../domain/session";

function buildExercise(
  t: WorkoutTemplate["exercises"][number],
  template: WorkoutTemplate,
  previousWeight: number | null,
): ExerciseSession {
  return buildExerciseSession({
    template,
    order: t.order,
    previousWeight,
    weightUnit: t.kind === "resistance" ? "lb" : null,
  });
}
