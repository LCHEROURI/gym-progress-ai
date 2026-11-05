import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  type Firestore,
} from "firebase/firestore";
import {
  exerciseSessionSchema,
  setSchema,
  workoutSessionSchema,
  type ExerciseSession,
  type WorkoutSession,
  type WorkoutSet,
} from "../domain/session";
import type { LoggedSet } from "../workout/summary";
import type { RepoCtx } from "./session-repository";
import {
  EXERCISE_DATE_FIELDS,
  SESSION_DATE_FIELDS,
  SET_DATE_FIELDS,
  withDateFields,
} from "./session-repository";

export interface HistoryRow {
  id: string;
  scheduledDate: string;
  workoutType: WorkoutSession["workoutType"];
  status: WorkoutSession["status"];
  exercisesDone: number;
  exercisesTotal: number;
}

export interface HistoryDetail {
  session: WorkoutSession;
  exercises: ExerciseSession[];
  sets: LoggedSet[];
}

const sessionsPath = (uid: string) => `users/${uid}/workoutSessions`;

/** Newest first. Each row carries its completion counts. */
export async function fetchHistory(
  ctx: RepoCtx,
  uid: string,
  max = 20,
): Promise<HistoryRow[]> {
  const snap = await getDocs(
    query(collection(ctx.db, sessionsPath(uid)), orderBy("scheduledDate", "desc"), limit(max)),
  );
  return Promise.all(
    snap.docs.map(async (d) => {
      const session = workoutSessionSchema.parse(
        withDateFields(d.data(), SESSION_DATE_FIELDS),
      );
      const exSnap = await getDocs(collection(ctx.db, `${sessionsPath(uid)}/${session.id}/exercises`));
      const exercises = exSnap.docs.map((e) =>
        exerciseSessionSchema.parse(withDateFields(e.data(), EXERCISE_DATE_FIELDS)),
      );
      return {
        id: session.id,
        scheduledDate: session.scheduledDate,
        workoutType: session.workoutType,
        status: session.status,
        exercisesDone: exercises.filter((e) => e.completed).length,
        exercisesTotal: exercises.length,
      };
    }),
  );
}

async function fetchSessionExercisesAndSets(
  ctx: RepoCtx,
  uid: string,
  session: WorkoutSession,
): Promise<HistoryDetail> {
  const exSnap = await getDocs(
    collection(ctx.db, `${sessionsPath(uid)}/${session.id}/exercises`),
  );
  const exercises = exSnap.docs.map((e) =>
    exerciseSessionSchema.parse(withDateFields(e.data(), EXERCISE_DATE_FIELDS)),
  );
  const setGroups = await Promise.all(
    exercises.map(async (e) => {
      const setSnap = await getDocs(
        collection(
          ctx.db,
          `${sessionsPath(uid)}/${session.id}/exercises/${e.exerciseKey}/sets`,
        ),
      );
      return setSnap.docs.map((s) => ({
        ...setSchema.parse(withDateFields(s.data(), SET_DATE_FIELDS)),
        exerciseKey: e.exerciseKey,
      }));
    }),
  );
  return { session, exercises, sets: setGroups.flat() };
}

export async function fetchHistoryDetail(
  ctx: RepoCtx,
  uid: string,
  sessionId: string,
): Promise<HistoryDetail> {
  const sessionSnap = await getDoc(doc(ctx.db, `${sessionsPath(uid)}/${sessionId}`));
  const session = workoutSessionSchema.parse(
    withDateFields(sessionSnap.data(), SESSION_DATE_FIELDS),
  );
  return fetchSessionExercisesAndSets(ctx, uid, session);
}

/** The most recent session details (newest first) — coach load history. */
export async function fetchRecentDetails(
  ctx: RepoCtx,
  uid: string,
  max = 3,
): Promise<HistoryDetail[]> {
  const snap = await getDocs(
    query(collection(ctx.db, sessionsPath(uid)), orderBy("scheduledDate", "desc"), limit(max)),
  );
  const sessions = snap.docs.map((d) =>
    workoutSessionSchema.parse(withDateFields(d.data(), SESSION_DATE_FIELDS)),
  );
  return Promise.all(
    sessions.map((session) => fetchSessionExercisesAndSets(ctx, uid, session)),
  );
}

export type { Firestore, WorkoutSet };
