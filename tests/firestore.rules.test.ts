import { afterAll, beforeAll, describe, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";

const live = !!process.env.FIRESTORE_EMULATOR_HOST;

describe.skipIf(!live)("firestore.rules (emulator)", () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: "demo-gym-progress-ai",
      firestore: { rules: readFileSync("firestore.rules", "utf8") },
    });
  });

  afterAll(async () => {
    await env.cleanup();
  });

  const session = {
    id: "s1", userId: "u1", templateId: "mon-strength-bike", workoutType: "strength_bike",
    scheduledDate: "2026-09-28", startedAt: null, completedAt: null, status: "in_progress",
    overallEffort: null, painReported: false, dizzinessReported: false,
    shortnessOfBreathReported: false, notes: "", createdAt: new Date(0), updatedAt: new Date(0),
  };

  it("owner can create a valid session", async () => {
    await assertSucceeds(env.authenticatedContext("u1").firestore()
      .doc("users/u1/workoutSessions/s1").set(session));
  });

  it("rejects unknown session status", async () => {
    await assertFails(env.authenticatedContext("u1").firestore()
      .doc("users/u1/workoutSessions/s2").set({ ...session, status: "finished" }));
  });

  it("rejects userId spoofing (UID lock)", async () => {
    await assertFails(env.authenticatedContext("u1").firestore()
      .doc("users/u1/workoutSessions/s3").set({ ...session, userId: "u2" }));
  });

  it("rejects schema pollution (extra field)", async () => {
    await assertFails(env.authenticatedContext("u1").firestore()
      .doc("users/u1/workoutSessions/s4").set({ ...session, extraData: "x" }));
  });

  it("rejects oversized notes (DoS guard)", async () => {
    await assertFails(env.authenticatedContext("u1").firestore()
      .doc("users/u1/workoutSessions/s5").set({ ...session, notes: "n".repeat(1001) }));
  });

  it("rejects invalid status transition not_started -> completed", async () => {
    const db = env.authenticatedContext("u1").firestore();
    await assertSucceeds(db.doc("users/u1/workoutSessions/s6").set({ ...session, id: "s6", status: "not_started" }));
    await assertFails(db.doc("users/u1/workoutSessions/s6").update({ status: "completed" }));
  });

  it("allows reopen transition completed -> in_progress", async () => {
    const db = env.authenticatedContext("u1").firestore();
    await assertSucceeds(db.doc("users/u1/workoutSessions/s6").update({ status: "in_progress" }));
  });

  it("denies cross-user reads", async () => {
    await assertFails(env.authenticatedContext("u2").firestore()
      .doc("users/u1/workoutSessions/s1").get());
  });

  it("denies unauthenticated access", async () => {
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(anon.doc("users/u1/workoutSessions/s1").get());
  });

  it("denies unrelated paths (catch-all)", async () => {
    await assertFails(env.authenticatedContext("u1").firestore().doc("secrets/s1").set({ x: 1 }));
  });

  it("aiRecommendations: create ok, provenance immutable, decision mutable", async () => {
    const rec = {
      exerciseKey: "leg-press", date: "2026-09-28", previousWeight: 70, suggestedWeight: 75,
      reason: "Both sets at target reps.", accepted: null, finalWeightChosen: null,
      model: "gemini", promptVersion: "v1", contextFacts: {}, blockedBySafety: false, createdAt: new Date(0),
    };
    const db = env.authenticatedContext("u1").firestore();
    await assertSucceeds(db.doc("users/u1/aiRecommendations/r1").set(rec));
    await assertFails(db.doc("users/u1/aiRecommendations/r1").update({ suggestedWeight: 200 }));
    await assertSucceeds(db.doc("users/u1/aiRecommendations/r1").update({ accepted: true, finalWeightChosen: 75 }));
  });

  it("personalRecords are append-only (no update)", async () => {
    const db = env.authenticatedContext("u1").firestore();
    const pr = { exerciseKey: "leg-press", weight: 75, reps: 10, sessionId: "s1", achievedAt: new Date(0) };
    await assertSucceeds(db.doc("users/u1/personalRecords/pr1").set(pr));
    await assertFails(db.doc("users/u1/personalRecords/pr1").update({ weight: 999 }));
  });

  it("weeklyReports are append-only (create validated, edit denied)", async () => {
    const db = env.authenticatedContext("u1").firestore();
    const report = {
      weekStart: "2026-09-21", weekEnd: "2026-09-27", planned: 3, completed: 3,
      completionRate: 1, strengthChanges: [], cardioMinutes: 42, prs: [], missed: [],
      facts: {}, aiObservations: [], nextWeek: [], createdAt: new Date(0),
    };
    await assertSucceeds(db.doc("users/u1/weeklyReports/w1").set(report));
    await assertFails(db.doc("users/u1/weeklyReports/w1").update({ cardioMinutes: 0 }));
    await assertFails(db.doc("users/u1/weeklyReports/w2").set({ cardioMinutes: 42 }));
  });

  it("exerciseStats cache is owner-writable with validation", async () => {
    const stat = {
      lastWeight: 70, lastReps: [10, 10], lastDifficulty: "good", highestWeight: 75,
      totalSessions: 4, lastWorkoutDate: "2026-09-25", updatedAt: new Date(0),
    };
    const db = env.authenticatedContext("u1").firestore();
    await assertSucceeds(db.doc("users/u1/exerciseStats/leg-press").set(stat));
    await assertFails(db.doc("users/u1/exerciseStats/leg-press").set({ ...stat, lastWeight: -5 }));
  });
});
