import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
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

const sessionPath = (uid: string, sid: string) =>
  `users/${uid}/workoutSessions/${sid}`;
const exercisePath = (uid: string, sid: string, exerciseKey: string) =>
  `${sessionPath(uid, sid)}/exercises/${exerciseKey}`;
const setPath = (uid: string, sid: string, exerciseKey: string, setId: string) =>
  `${exercisePath(uid, sid, exerciseKey)}/sets/${setId}`;

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
    now?: Date;
  },
): Promise<WorkoutSession> {
  const session = buildSession(input);
  const batch = writeBatch(ctx.db);
  batch.set(doc(ctx.db, sessionPath(input.uid, session.id)), session);
  for (const t of input.template.exercises) {
    const ex = buildExerciseSession({
      template: input.template,
      order: t.order,
      previousWeight: input.previousWeights[t.key] ?? null,
      weightUnit: "lb",
      now: input.now,
    });
    batch.set(doc(ctx.db, exercisePath(input.uid, session.id, ex.exerciseKey)), ex);
  }
  await batch.commit();
  return session;
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
  return snap.docs.map((d) => exerciseSessionSchema.parse(d.data()));
}
