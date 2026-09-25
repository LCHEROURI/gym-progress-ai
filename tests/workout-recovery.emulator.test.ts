import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import {
  connectFirestoreEmulator,
  getFirestore,
  terminate,
  type Firestore,
} from "firebase/firestore";
import {
  fetchActiveWorkout,
  logSet,
  saveExercise,
  startSession,
} from "../src/data/session-repository";
import { MONDAY } from "../src/domain/templates";

const live = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
describe.skipIf(!live)("workout recovery (Firestore emulator)", () => {
  let env: RulesTestEnvironment;
  let writeApp: FirebaseApp;
  let writeDb: Firestore;
  let recoveryApp: FirebaseApp | undefined;
  let recoveryDb: Firestore | undefined;
  const uid = "u1";
  const sessionId = "recovery-session-1";
  const now = new Date("2026-09-28T09:00:00.000Z");

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: "demo-gym-progress-ai",
      firestore: { rules: readFileSync("firestore.rules", "utf8") },
    });
    // Emulator data persists between runs; clear once so this test remains repeatable.
    await env.clearFirestore();
    const portText = process.env.FIRESTORE_EMULATOR_HOST!.split(":").at(-1);
    writeApp = initializeApp(
      { projectId: env.projectId },
      `workout-recovery-write-${Date.now()}`,
    );
    writeDb = getFirestore(writeApp);
    connectFirestoreEmulator(writeDb, "127.0.0.1", Number(portText), {
      mockUserToken: { user_id: uid },
    });
  });

  afterAll(async () => {
    if (recoveryDb) await terminate(recoveryDb);
    if (recoveryApp) await deleteApp(recoveryApp);
    if (writeDb) await terminate(writeDb);
    if (writeApp) await deleteApp(writeApp);
    await env?.cleanup();
  });

  it("creates, autosaves, and restores an unfinished workout in a fresh client", async () => {
    const ctx = { db: writeDb };
    const { session, exercises } = await startSession(ctx, {
      sessionId,
      uid,
      template: MONDAY,
      scheduledDate: "2026-09-28",
      previousWeights: { "leg-press": 70 },
      initialWeights: { "leg-press": 75 },
      weightUnit: "lb",
      now,
    });

    expect(session.status).toBe("in_progress");
    expect(session.startedAt).toEqual(now);
    const legPress = exercises.find((exercise) => exercise.exerciseKey === "leg-press");
    expect(legPress).toBeDefined();
    const savedLegPress = await saveExercise(ctx, {
      uid,
      sessionId,
      current: legPress!,
      patch: { weightUsed: 75, completed: true },
      now,
    });
    await logSet(ctx, {
      uid,
      sessionId,
      exerciseKey: "leg-press",
      set: { setNumber: 1, weight: 75, reps: 10, completed: true, createdAt: now },
      now,
    });

    // A separate client instance models a reload; all operations still pass through rules.
    recoveryApp = initializeApp(
      { projectId: env.projectId },
      `workout-recovery-read-${Date.now()}`,
    );
    recoveryDb = getFirestore(recoveryApp);
    const portText = process.env.FIRESTORE_EMULATOR_HOST!.split(":").at(-1);
    connectFirestoreEmulator(recoveryDb, "127.0.0.1", Number(portText), {
      mockUserToken: { user_id: uid },
    });

    const restored = await fetchActiveWorkout({ db: recoveryDb }, uid);
    expect(restored?.session.id).toBe(sessionId);
    expect(restored?.session.status).toBe("in_progress");
    expect(restored?.exercises.find((exercise) => exercise.exerciseKey === "leg-press"))
      .toEqual(savedLegPress);
    expect(restored?.sets).toHaveLength(1);
    expect(restored?.sets[0]).toMatchObject({
      setNumber: 1,
      weight: 75,
      reps: 10,
      completed: true,
      exerciseKey: "leg-press",
    });
    expect(restored?.sets[0]?.createdAt).toEqual(now);
  });
});
