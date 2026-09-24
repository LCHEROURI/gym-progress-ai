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
      const session = workoutSessionSchema.parse(d.data());
      const exSnap = await getDocs(collection(ctx.db, `${sessionsPath(uid)}/${session.id}/exercises`));
      const exercises = exSnap.docs.map((e) => exerciseSessionSchema.parse(e.data()));
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

export async function fetchHistoryDetail(
  ctx: RepoCtx,
  uid: string,
  sessionId: string,
): Promise<HistoryDetail> {
  const sessionSnap = await getDoc(doc(ctx.db, `${sessionsPath(uid)}/${sessionId}`));
  const session = workoutSessionSchema.parse(sessionSnap.data());
  const exSnap = await getDocs(collection(ctx.db, `${sessionsPath(uid)}/${sessionId}/exercises`));
  const exercises = exSnap.docs.map((e) => exerciseSessionSchema.parse(e.data()));

  const sets: LoggedSet[] = [];
  for (const e of exercises) {
    const setSnap = await getDocs(
      collection(ctx.db, `${sessionsPath(uid)}/${sessionId}/exercises/${e.exerciseKey}/sets`),
    );
    for (const s of setSnap.docs) {
      sets.push({ ...setSchema.parse(s.data()), exerciseKey: e.exerciseKey });
    }
  }
  return { session, exercises, sets };
}

/** The most recent session details (newest first) — coach load history. */
export async function fetchRecentDetails(
  ctx: RepoCtx,
  uid: string,
  max = 3,
): Promise<HistoryDetail[]> {
  const rows = await fetchHistory(ctx, uid, max);
  return Promise.all(rows.map((r) => fetchHistoryDetail(ctx, uid, r.id)));
}

export type { Firestore, WorkoutSet };
