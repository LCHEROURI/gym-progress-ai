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
    // Re-runnable suite: the emulator daemon persists docs across runs and the
    // cases use fixed ids (create-vs-update semantics would flip otherwise).
    await env.clearFirestore();
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

  it("fcmTokens: owner registration validated, id bound to doc, cross-user denied", async () => {
    const token = {
      id: "ta", token: "fcm-token-abc", timeZone: "America/New_York", platform: "web",
      createdAt: new Date(0), updatedAt: new Date(0),
    };
    const db = env.authenticatedContext("u1").firestore();
    await assertSucceeds(db.doc("users/u1/fcmTokens/ta").set(token));
    await assertFails(db.doc("users/u1/fcmTokens/tb").set({ ...token, id: "tb", platform: "ios" }));
    await assertFails(db.doc("users/u1/fcmTokens/tc").set({ ...token, id: "tc", token: "x".repeat(4097) }));
    await assertFails(db.doc("users/u1/fcmTokens/td").set({ ...token, id: "td", extra: 1 }));
    await assertFails(db.doc("users/u1/fcmTokens/tz").set(token)); // id != doc id
    await assertFails(env.authenticatedContext("u2").firestore().doc("users/u1/fcmTokens/ta").get());
  });

  it("reminderState is the server's send guard: owner reads, client never writes", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc("users/u1/reminderState/ta").set({
        tokenId: "ta", slot: "2026-09-25T07:30", sentAt: new Date(0),
      });
    });
    const db = env.authenticatedContext("u1").firestore();
    await assertSucceeds(db.doc("users/u1/reminderState/ta").get());
    await assertFails(db.doc("users/u1/reminderState/ta").set({
      tokenId: "ta", slot: "2026-09-26T07:30", sentAt: new Date(0),
    }));
    await assertFails(db.doc("users/u1/reminderState/ta").delete());
    await assertFails(env.authenticatedContext("u2").firestore().doc("users/u1/reminderState/ta").get());
  });

  it("installEvents: nudge types append, unknown types and edits denied", async () => {
    const event = {
      id: "ev1", type: "nudge_shown", outcome: null, method: null,
      userAgent: "Mozilla/5.0 (iPhone)", createdAt: new Date(0),
    };
    const db = env.authenticatedContext("u1").firestore();
    await assertSucceeds(db.doc("users/u1/installEvents/ev1").set(event));
    await assertSucceeds(db.doc("users/u1/installEvents/ev2").set({ ...event, id: "ev2", type: "nudge_dismissed" }));
    await assertSucceeds(db.doc("users/u1/installEvents/ev3").set({ ...event, id: "ev3", type: "prompt_offered" }));
    await assertFails(db.doc("users/u1/installEvents/ev4").set({ ...event, id: "ev4", type: "nudge_clicked" }));
    await assertFails(db.doc("users/u1/installEvents/ev1").update({ type: "installed" }));
    await assertFails(env.authenticatedContext("u2").firestore().doc("users/u1/installEvents/ev1").get());
  });
});

describe.skipIf(!live)("bootFailures rules (emulator)", () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: "demo-gym-progress-ai",
      firestore: { rules: readFileSync("firestore.rules", "utf8") },
    });
    await env.clearFirestore();
  });

  afterAll(async () => {
    await env.cleanup();
  });

  const report = {
    buildId: "20260928abcd",
    stage: "boot",
    message: "No mount signal within timeout",
    platform: "iPhone",
    standalone: true,
    elapsedMs: 15002,
  };

  it("denies client writes even from a signed-in user", async () => {
    // The Function uses the Admin SDK (bypasses rules). A client must never
    // be able to write or forge a report.
    await assertFails(env.authenticatedContext("u1").firestore()
      .doc("bootFailures/forged").set(report));
  });

  it("denies anonymous client writes", async () => {
    await assertFails(env.unauthenticatedContext().firestore()
      .doc("bootFailures/anon").set(report));
  });

  it("denies reads to any client, including the reported user", async () => {
    // Seed via the rules-unaware admin path so there is something to read.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc("bootFailures/seeded").set({ ...report, uid: "u1", count: 1 });
    });
    await assertFails(env.authenticatedContext("u1").firestore()
      .doc("bootFailures/seeded").get());
  });
});
