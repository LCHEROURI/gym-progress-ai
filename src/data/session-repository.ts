import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  where,
  query,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import {
  buildExerciseSession,
  buildSession,
  canTransition,
  exerciseSessionSchema,
  setSchema,
  workoutSessionSchema,
  type ExerciseSession,
  type SessionStatus,
  type WorkoutSession,
  type WorkoutSet,
} from "../domain/session";
import type { WorkoutTemplate } from "../domain/templates";

export interface RepoCtx {
  db: Firestore;
}

export interface ActiveWorkout {
  session: WorkoutSession;
  exercises: ExerciseSession[];
  sets: Array<WorkoutSet & { exerciseKey: string }>;
}

const sessionPath = (uid: string, sid: string) =>
  `users/${uid}/workoutSessions/${sid}`;
const exercisePath = (uid: string, sid: string, exerciseKey: string) =>
  `${sessionPath(uid, sid)}/exercises/${exerciseKey}`;
const setPath = (uid: string, sid: string, exerciseKey: string, setId: string) =>
  `${exercisePath(uid, sid, exerciseKey)}/sets/${setId}`;

/**
 * Firestore returns Timestamp objects; the Zod schemas declare z.date(). Every
 * read path must convert before validating or the parse throws and the screen
 * shows a generic load error.
 *
 * These lists are exported rather than inlined at each call site because the
 * original bug was exactly a call site that forgot: fetchActiveWorkout
 * converted and history.ts / progress.ts did not, so the restore path worked
 * while History and Progress failed for every account with a saved workout.
 * An account with no sessions never triggers the parse, which is why the unit
 * tests (which mock getDocs with plain Dates) stayed green.
 */
export const SESSION_DATE_FIELDS = ["startedAt", "completedAt", "createdAt", "updatedAt"];
export const EXERCISE_DATE_FIELDS = ["createdAt", "updatedAt"];
export const SET_DATE_FIELDS = ["createdAt"];
/** weeklyReportSchema stores createdAt as a z.date(); reports.ts reads it back. */
export const REPORT_DATE_FIELDS = ["createdAt"];

export function withDateFields(data: unknown, fields: string[]): unknown {
  if (!data || typeof data !== "object") return data;
  const record = data as Record<string, unknown>;
  const dates = new Set(fields);
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => {
      if (
        dates.has(key) &&
        value !== null &&
        typeof value === "object" &&
        "toDate" in value &&
        typeof value.toDate === "function"
      ) {
        return [key, value.toDate()];
      }
      return [key, value];
    }),
  );
}

/** Last used weight per exercise key, from the derived stats cache. */
export async function fetchPreviousWeights(
  ctx: RepoCtx,
  uid: string,
  keys: string[],
): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = {};
  await Promise.all(
    keys.map(async (key) => {
      const snap = await getDoc(doc(ctx.db, `users/${uid}/exerciseStats/${key}`));
      const data = snap.data() as { lastWeight?: number } | undefined;
      out[key] = data && typeof data.lastWeight === "number" ? data.lastWeight : null;
    }),
  );
  return out;
}

/** Creates the session + one exercise doc per template exercise in one atomic batch. */
export async function startSession(
  ctx: RepoCtx,
  input: {
    sessionId: string;
    uid: string;
    template: WorkoutTemplate;
    scheduledDate: string;
    previousWeights: Record<string, number | null>;
    initialWeights?: Record<string, number>;
    weightUnit?: "lb" | "kg";
    now?: Date;
  },
): Promise<{ session: WorkoutSession; exercises: ExerciseSession[] }> {
  const now = input.now ?? new Date();
  const draft = buildSession({ ...input, now });
  const session = workoutSessionSchema.parse({
    ...draft,
    status: "in_progress",
    startedAt: now,
  });
  const exercises = input.template.exercises.map((t) =>
    buildExerciseSession({
      template: input.template,
      order: t.order,
      previousWeight: input.previousWeights[t.key] ?? null,
      initialWeight: input.initialWeights?.[t.key],
      weightUnit: t.kind === "resistance" ? input.weightUnit ?? "lb" : null,
      now,
    }),
  );
  const batch = writeBatch(ctx.db);
  batch.set(doc(ctx.db, sessionPath(input.uid, session.id)), session);
  for (const exercise of exercises) {
    batch.set(
      doc(ctx.db, exercisePath(input.uid, session.id, exercise.exerciseKey)),
      exercise,
    );
  }
  await batch.commit();
  return { session, exercises };
}

/**
 * Finds the newest unfinished workout and restores its persisted exercise/set
 * state. Firestore's offline cache is the recovery source of truth.
 */
export async function fetchActiveWorkout(
  ctx: RepoCtx,
  uid: string,
): Promise<ActiveWorkout | null> {
  const snap = await getDocs(
    query(
      collection(ctx.db, `users/${uid}/workoutSessions`),
      where("status", "==", "in_progress"),
    ),
  );
  const candidates = snap.docs
    .map((docSnap) =>
      workoutSessionSchema.parse(
        withDateFields(docSnap.data(), ["startedAt", "completedAt", "createdAt", "updatedAt"]),
      ),
    )
    .sort((a, b) =>
      b.scheduledDate.localeCompare(a.scheduledDate) ||
      b.updatedAt.getTime() - a.updatedAt.getTime(),
    );
  const session = candidates[0];
  if (!session) return null;

  const exerciseSnap = await getDocs(
    collection(ctx.db, `${sessionPath(uid, session.id)}/exercises`),
  );
  const exercises = exerciseSnap.docs.map((docSnap) =>
    exerciseSessionSchema.parse(
      withDateFields(docSnap.data(), ["createdAt", "updatedAt"]),
    ),
  );
  const setGroups = await Promise.all(
    exercises.map(async (exercise) => {
      const setSnap = await getDocs(
        collection(
          ctx.db,
          `${exercisePath(uid, session.id, exercise.exerciseKey)}/sets`,
        ),
      );
      return setSnap.docs.map((docSnap) => ({
        ...setSchema.parse(withDateFields(docSnap.data(), ["createdAt"])),
        exerciseKey: exercise.exerciseKey,
      }));
    }),
  );
  return { session, exercises, sets: setGroups.flat() };
}

/**
 * Immediate autosave for one exercise card. The full merged document is
 * Zod-validated before any write leaves the device.
 */
export async function saveExercise(
  ctx: RepoCtx,
  input: {
    uid: string;
    sessionId: string;
    current: ExerciseSession;
    patch: Partial<ExerciseSession>;
    now?: Date;
  },
): Promise<ExerciseSession> {
  const merged = exerciseSessionSchema.parse({
    ...input.current,
    ...input.patch,
    updatedAt: input.now ?? new Date(),
  });
  await updateDoc(
    doc(ctx.db, exercisePath(input.uid, input.sessionId, merged.exerciseKey)),
    merged as unknown as Record<string, unknown>,
  );
  return merged;
}

/** Session-level autosave (notes, flags, effort) with the status state machine enforced. */
export async function saveSession(
  ctx: RepoCtx,
  input: {
    uid: string;
    current: WorkoutSession;
    patch: Partial<WorkoutSession>;
    now?: Date;
  },
): Promise<WorkoutSession> {
  if (input.patch.status && input.patch.status !== input.current.status) {
    if (!canTransition(input.current.status, input.patch.status as SessionStatus)) {
      throw new Error(
        `Invalid status transition ${input.current.status} -> ${input.patch.status}`,
      );
    }
  }
  const patch = { ...input.patch };
  if (patch.status === "in_progress" && !input.current.startedAt) {
    patch.startedAt = input.now ?? new Date();
  }
  const merged = workoutSessionSchema.parse({
    ...input.current,
    ...patch,
    updatedAt: input.now ?? new Date(),
  });
  await updateDoc(
    doc(ctx.db, sessionPath(input.uid, merged.id)),
    merged as unknown as Record<string, unknown>,
  );
  return merged;
}

/** Autosave one completed set (`sets/s{N}` ids keep rules' setNumber binding tidy). */
export async function logSet(
  ctx: RepoCtx,
  input: {
    uid: string;
    sessionId: string;
    exerciseKey: string;
    set: WorkoutSet;
    now?: Date;
  },
): Promise<void> {
  const validated = setSchema.parse({
    ...input.set,
    createdAt: input.set.createdAt ?? input.now ?? new Date(),
  });
  await setDoc(
    doc(ctx.db, setPath(input.uid, input.sessionId, input.exerciseKey, `s${validated.setNumber}`)),
    validated as unknown as Record<string, unknown>,
  );
}

/** Completion summary inputs, counted deterministically from the session tree. */
export async function fetchExercises(
  ctx: RepoCtx,
  uid: string,
  sessionId: string,
): Promise<ExerciseSession[]> {
  const snap = await getDocs(
    collection(ctx.db, `${sessionPath(uid, sessionId)}/exercises`),
  );
  return snap.docs.map((d) =>
    exerciseSessionSchema.parse(withDateFields(d.data(), EXERCISE_DATE_FIELDS)),
  );
}
