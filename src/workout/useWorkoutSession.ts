import { useCallback, useEffect, useRef, useState } from "react";
import type { Firestore } from "firebase/firestore";
import {
  buildExerciseSession,
  type ExerciseSession,
  type WorkoutSession,
  type WorkoutSet,
} from "../domain/session";
import type { WorkoutTemplate } from "../domain/templates";
import { buildEffectiveTemplate } from "../domain/effectiveTemplate";
import type { Profile } from "../data/settings";
import {
  createExercise,
  fetchActiveWorkout,
  fetchPreviousWeights,
  logSet as persistSet,
  saveExercise,
  saveSession,
  startSession,
  upsertExerciseStat,
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
import { templateForId } from "../domain/recovery";
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
  profile?: Pick<Profile, "extraExercises"> | null;
}): WorkoutFlow {
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [exercises, setExercises] = useState<ExerciseSession[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sets, setSets] = useState<LoggedSet[]>([]);
  const [recommendations, setRecommendations] = useState<Record<string, CoachSuggestion>>({});
  const [restoring, setRestoring] = useState(true);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const starting = useRef(false);
  const {
    db,
    uid,
    template,
    profile,
    scheduledDate,
    coachEnabled,
    weightUnit = 'lb',
  } = input;
  void scheduledDate;
  void coachEnabled;
  const restoringRef = useRef(false);
  const restoreErrorRef = useRef<string | null>(null);

  // ADD ONLY these two new guards:
  const restoredSessionIdRef = useRef<string | null>(null);
  const reconciledSessionKeyRef = useRef<string | null>(null);

  const inputRef = useRef(input);
  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  const templateId = template?.id;
  const extraExerciseKeys = (profile?.extraExercises ?? []).map((e) => e.key).join(',');

  const restore = useCallback(async () => {
    if (!db || !uid || restoringRef.current) return;

    restoringRef.current = true;
    setRestoring(true);
    restoreErrorRef.current = null;
    setRestoreError(null);

    try {
      const active = await fetchActiveWorkout({ db }, uid);

      if (!active) {
        setSession(null);
        setExercises([]);
        setSets([]);
        restoredSessionIdRef.current = null;
        return;
      }

      if (restoredSessionIdRef.current === active.session.id) {
        return;
      }

      const sessionTemplate =
        (active.session.templateId ? templateForId(active.session.templateId) : undefined) ??
        inputRef.current.template;

      const currentProfile = inputRef.current.profile;
      const targetTemplate = currentProfile
        ? buildEffectiveTemplate(sessionTemplate, currentProfile)
        : sessionTemplate;

      const existingKeys = new Set(active.exercises.map((e) => e.exerciseKey));
      const missingExercises: ExerciseSession[] = [];
      const missingTemplateExercises = targetTemplate.exercises.filter(
        (tmplEx) => !existingKeys.has(tmplEx.key),
      );

      if (missingTemplateExercises.length > 0) {
        const missingKeys = missingTemplateExercises.map((t) => t.key);
        const previousWeights: Record<string, number | null> = await fetchPreviousWeights(
          { db },
          uid,
          missingKeys,
        ).catch(() => ({}));
        missingTemplateExercises.forEach((tmplEx) => {
          const newExercise = buildExerciseSession({
            template: targetTemplate,
            order: tmplEx.order,
            previousWeight: previousWeights[tmplEx.key] ?? null,
            weightUnit: tmplEx.kind === "resistance" ? (inputRef.current.weightUnit ?? 'lb') : null,
          });
          missingExercises.push(newExercise);
        });

        await Promise.allSettled(
          missingExercises.map((exercise) =>
            createExercise({ db }, { uid, sessionId: active.session.id, exercise })
          )
        );
      }

      restoredSessionIdRef.current = active.session.id;
      setSession(active.session);
      setExercises([...active.exercises, ...missingExercises]);
      setSets(active.sets);
    } catch {
      const msg = 'Could not check for an unfinished workout. Retry before starting another workout.';
      restoreErrorRef.current = msg;
      setRestoreError(msg);
    } finally {
      restoringRef.current = false;
      setRestoring(false);
    }
  }, [db, uid]);

  useEffect(() => {
    void restore();
  }, [restore]);

  useEffect(() => {
    const currentSession = session;
    if (!currentSession?.id || !db || !uid) return;

    const reconcileKey = `${currentSession.id}_${templateId}_${extraExerciseKeys}_${weightUnit}`;
    if (reconciledSessionKeyRef.current === reconcileKey) {
      return;
    }

    const reconcileExtras = async () => {
      const currentProfile = inputRef.current.profile;
      const baseTmpl =
        (currentSession.templateId ? templateForId(currentSession.templateId) : undefined) ??
        inputRef.current.template;

      const targetTemplate = currentProfile
        ? buildEffectiveTemplate(baseTmpl, currentProfile)
        : baseTmpl;

      const existingKeys = new Set(exercises.map((e) => e.exerciseKey));
      const missingTemplateExercises = targetTemplate.exercises.filter(
        (tmplEx) => !existingKeys.has(tmplEx.key),
      );

      if (missingTemplateExercises.length > 0) {
        const missingKeys = missingTemplateExercises.map((t) => t.key);
        const previousWeights: Record<string, number | null> = await fetchPreviousWeights(
          { db },
          uid,
          missingKeys,
        ).catch(() => ({}));
        const toAdd: ExerciseSession[] = missingTemplateExercises.map((tmplEx) =>
          buildExerciseSession({
            template: targetTemplate,
            order: tmplEx.order,
            previousWeight: previousWeights[tmplEx.key] ?? null,
            weightUnit: tmplEx.kind === "resistance" ? (inputRef.current.weightUnit ?? 'lb') : null,
          }),
        );

        await Promise.allSettled(
          toAdd.map((exercise) =>
            createExercise({ db }, { uid, sessionId: currentSession.id, exercise })
          )
        );

        setExercises((prev) => {
          const prevKeys = new Set(prev.map((e) => e.exerciseKey));
          const trulyNew = toAdd.filter((e) => !prevKeys.has(e.exerciseKey));
          return [...prev, ...trulyNew];
        });
      }

      reconciledSessionKeyRef.current = reconcileKey;
    };

    void reconcileExtras();
  }, [session?.id, templateId, extraExerciseKeys, weightUnit, db, uid]);

  const start = useCallback(async (initialWeights?: Record<string, number>) => {
    if (starting.current || restoringRef.current || restoreErrorRef.current) return;
    starting.current = true;
    try {
      setError(null);
      const effectiveTemplate = buildEffectiveTemplate(input.template, input.profile);
      const effectiveExercises = effectiveTemplate.exercises;
      const keys = effectiveExercises.map((e) => e.key);
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
        template: effectiveTemplate,
        scheduledDate: input.scheduledDate,
        previousWeights,
        initialWeights,
        weightUnit: input.weightUnit ?? "lb",
        profile: input.profile,
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
        for (const exercise of effectiveExercises) {
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
  }, [db, uid, input.template, input.scheduledDate, input.coachEnabled, input.weightUnit, input.profile]);

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
    const now = new Date();
    await patchSession({ status: "completed", completedAt: now });
    if (!session || !db || !uid) return;
    await Promise.allSettled(
      exercises
        .filter((e) => typeof e.weightUsed === "number" && e.weightUsed >= 0)
        .map((e) =>
          upsertExerciseStat(
            { db },
            {
              uid,
              exerciseKey: e.exerciseKey,
              lastWeight: e.weightUsed as number,
              difficulty: e.difficulty,
              lastWorkoutDate: session.scheduledDate,
              now,
            },
          ),
        ),
    );
  }, [patchSession, session, db, uid, exercises]);

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
