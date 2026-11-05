import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
} from "firebase/firestore";
import {
  exerciseSessionSchema,
  workoutSessionSchema,
} from "../domain/session";
import type { ExerciseFact, SessionFact } from "../progress/stats";
import type { RepoCtx } from "./session-repository";
import {
  EXERCISE_DATE_FIELDS,
  SESSION_DATE_FIELDS,
  withDateFields,
} from "./session-repository";

export interface ProgressFacts {
  sessions: SessionFact[];
  exercises: ExerciseFact[];
}

/** Lightweight session facts (no exercise reads) — streaks and week math. */
export async function fetchSessionFacts(
  ctx: RepoCtx,
  uid: string,
  max = 60,
): Promise<SessionFact[]> {
  const snap = await getDocs(
    query(
      collection(ctx.db, `users/${uid}/workoutSessions`),
      orderBy("scheduledDate", "desc"),
      limit(max),
    ),
  );
  return snap.docs.map((d) => {
    const s = workoutSessionSchema.parse(withDateFields(d.data(), SESSION_DATE_FIELDS));
    return { id: s.id, scheduledDate: s.scheduledDate, status: s.status };
  });
}

/** All recorded facts for the progress dashboard, newest sessions first. */
export async function fetchProgressFacts(
  ctx: RepoCtx,
  uid: string,
  max = 60,
): Promise<ProgressFacts> {
  const snap = await getDocs(
    query(
      collection(ctx.db, `users/${uid}/workoutSessions`),
      orderBy("scheduledDate", "desc"),
      limit(max),
    ),
  );
  const parsedSessions = snap.docs.map((d) =>
    workoutSessionSchema.parse(withDateFields(d.data(), SESSION_DATE_FIELDS)),
  );
  const exerciseSnaps = await Promise.all(
    parsedSessions.map((s) =>
      getDocs(collection(ctx.db, `users/${uid}/workoutSessions/${s.id}/exercises`)),
    ),
  );

  const sessions: SessionFact[] = [];
  const exercises: ExerciseFact[] = [];
  parsedSessions.forEach((s, idx) => {
    sessions.push({ id: s.id, scheduledDate: s.scheduledDate, status: s.status });
    for (const e of exerciseSnaps[idx].docs) {
      const ex = exerciseSessionSchema.parse(withDateFields(e.data(), EXERCISE_DATE_FIELDS));
      exercises.push({
        sessionId: s.id,
        scheduledDate: s.scheduledDate,
        exerciseKey: ex.exerciseKey,
        exerciseName: ex.exerciseName,
        completed: ex.completed,
        weightUsed: ex.weightUsed,
        difficulty: ex.difficulty,
        durationMinutes: ex.durationMinutes,
      });
    }
  });
  return { sessions, exercises };
}
