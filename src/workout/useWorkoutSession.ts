import { useCallback, useEffect, useRef, useState } from "react";
import type { Firestore } from "firebase/firestore";
import type { ExerciseSession, WorkoutSession, WorkoutSet } from "../domain/session";
import type { WorkoutTemplate } from "../domain/templates";
import {
  fetchActiveWorkout,
  fetchPreviousWeights,
  logSet as persistSet,
  saveExercise,
  saveSession,
  startSession,
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
  phase: "restoring" | "today" | "active" | "complete";
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
  retryRestore: () => Promise<void>;
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
  const [restoring, setRestoring] = useState(true);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const starting = useRef(false);
  const db = input.db;
  const uid = input.uid;
  const restoringRef = useRef(true);
  const restoreErrorRef = useRef<string | null>(null);

  const restore = useCallback(async () => {
    restoringRef.current = true;
    restoreErrorRef.current = null;
    setRestoring(true);
    setRestoreError(null);
    try {
      const active = await fetchActiveWorkout({ db }, uid);
      if (active) {
        setSession(active.session);
        setExercises(active.exercises);
        setSets(active.sets);
      }
    } catch {
      const message = "Could not check for an unfinished workout. Retry before starting another workout.";
      restoreErrorRef.current = message;
      setRestoreError(message);
    } finally {
      restoringRef.current = false;
      setRestoring(false);
    }
  }, [db, uid]);

  useEffect(() => {
    void restore();
  }, [restore]);

  const start = useCallback(async (initialWeights?: Record<string, number>) => {
    if (starting.current || restoringRef.current || restoreErrorRef.current) return;
    starting.current = true;
    try {
      setError(null);
      const keys = input.template.exercises.map((e) => e.key);
      let previousWeightsUnavailable = false;
      const [previousWeights, recent] = await Promise.all([
        fetchPreviousWeights({ db }, uid, keys).catch(() => {
          previousWeightsUnavailable = true;
          return Object.fromEntries(keys.map((key) => [key, null]));
        }),
        fetchRecentDetails({ db }, uid, 3).catch(() => []),
      ]);
      const created = await startSession({ db }, {
        sessionId: newSessionId(),
        uid,
        template: input.template,
        scheduledDate: input.scheduledDate,
        previousWeights,
        initialWeights,
        weightUnit: input.weightUnit ?? "lb",
      });
      // The workout is live as soon as its atomic Firestore batch succeeds;
      // optional recommendation writes must never strand the user on the plan.
      setSession(created.session);
      setExercises(created.exercises);
      setRecommendations({});
      if (previousWeightsUnavailable) {
        setError("Could not load previous machine weights; this workout started without prefilled history.");
      }

      if (input.coachEnabled === false) return;
      const loads = buildLoads(recent);
      const suggestions: Record<string, CoachSuggestion> = {};
      try {
        for (const exercise of input.template.exercises) {
          if (exercise.kind !== "resistance") continue;
          const recommendation = recommendWeight({
            loads: loads[exercise.key] ?? [],
            targetSets: exercise.targetSets ?? 1,
            targetRepsMin: exercise.targetRepsMin ?? 10,
            increment: 5,
          });
          const id = newRecommendationId();
          await saveRecommendation(
            { db },
            uid,
            id,
            buildRecommendationRecord({
              recommendation,
              exerciseKey: exercise.key,
              date: input.scheduledDate,
              model: "deterministic",
              promptVersion: "none",
            }),
          );
          suggestions[exercise.key] = {
            id,
            recommendation,
            reason: recommendation.reason,
          };
        }
        setRecommendations(suggestions);
      } catch {
        // Recommendation persistence is optional; the persisted workout remains usable.
        setRecommendations(suggestions);
        setError("Workout started, but some coach suggestions could not be saved.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the workout.");
    } finally {
      starting.current = false;
    }
  }, [db, uid, input.template, input.scheduledDate, input.coachEnabled, input.weightUnit]);

  const patchExercise = useCallback(
    async (exerciseKey: string, patch: Partial<ExerciseSession>) => {
      const current = exercises.find((e) => e.exerciseKey === exerciseKey);
      if (!current || !session) return;
      try {
        const merged = await saveExercise({ db }, {
          uid,
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
    [exercises, session, db, uid],
  );

  const patchSession = useCallback(
    async (patch: Partial<WorkoutSession>) => {
      if (!session) return;
      try {
        const merged = await saveSession({ db }, { uid, current: session, patch });
        setSession(merged);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save your entry.");
      }
    },
    [session, db, uid],
  );

  const logSet = useCallback(
    async (exerciseKey: string, set: WorkoutSet) => {
      if (!session) return;
      try {
        await persistSet({ db }, {
          uid,
          sessionId: session.id,
          exerciseKey,
          set,
        });
        setSets((list) => [...list, { ...set, exerciseKey }]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save your set.");
      }
    },
    [session, db, uid],
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
        await recordDecision({ db }, uid, entry.id, decision);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save your decision.");
      }
    },
    [recommendations, db, uid],
  );

  const reset = useCallback(() => {
    setSession(null);
    setExercises([]);
    setSets([]);
    setRecommendations({});
    setError(null);
    void restore();
  }, [restore]);

  return {
    phase: restoring
      ? "restoring"
      : session
        ? session.status === "completed"
          ? "complete"
          : "active"
        : restoreError
          ? "restoring"
          : "today",
    session,
    exercises,
    sets,
    error: error ?? restoreError,
    start,
    patchExercise,
    patchSession,
    logSet,
    complete,
    reset,
    retryRestore: restore,
    recommendations,
    decide,
  };
}
