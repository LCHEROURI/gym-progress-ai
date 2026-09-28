/**
 * Sunday weekly reports.
 *
 * Cloud Scheduler fires `sundayWeeklyReports` every Sunday at noon Eastern —
 * after the week's last scheduled session (Friday) and while it is still
 * Sunday in UTC, so weekStartFor() keys the report to the week ending today.
 *
 * Pipeline (identical to the in-app generator): recorded facts → deterministic
 * aggregation (src/reports/weekly.ts) → Gemini observations over computed
 * facts only (deterministic fallback voice when Gemini is missing or fails)
 * → append-only save at users/{uid}/weeklyReports/w{weekStart}.
 *
 * Deploy (Cloud Functions require the Blaze plan):
 *   npx -y firebase-tools@latest deploy --only functions
 *
 * Gemini (optional): copy functions/.env.example to functions/.env and set
 * GEMINI_API_KEY. Without it, reports use the deterministic voice. The key
 * stays server-side — it never ships in the browser bundle.
 */
import { GoogleGenAI } from "@google/genai";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import {
  WEEKLY_OBSERVATIONS_SYSTEM,
  weeklyObservationsPrompt,
} from "../../src/ai/prompts/weekly-observations";
import type { ExerciseFact, SessionFact } from "../../src/progress/stats";
import {
  buildWeeklyReport,
  reportIdFor,
  weekStartFor,
  type WeeklyReport,
} from "../../src/reports/weekly";
import {
  exerciseFactFrom,
  finalizeReport,
  sessionFactFrom,
  shouldGenerateReport,
} from "./report-run";
import { normalizeBootReport } from "./boot-report";
import {
  alreadySent,
  buildReminderMessage,
  reminderStateSchema,
  slotsDue,
} from "./reminders";

/** Sunday 12:00 — the brief: "Run on Sunday". Noon keeps the calendar date */
/** stable in UTC (weekStartFor keys on UTC) and is safely after Friday. */
export const SUNDAY_CRON = "0 12 * * 0";
export const REPORT_TIME_ZONE = "America/New_York";

// Keep the default in sync with DEFAULT_MODEL in src/coach/explain.ts.
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

/** Gemini comments on computed facts; null means "use the fallback voice". */
async function geminiText(facts: Record<string, unknown>): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  try {
    const ai = new GoogleGenAI({ apiKey });
    const res = await ai.models.generateContent({
      model: MODEL,
      contents: weeklyObservationsPrompt(facts),
      config: { systemInstruction: WEEKLY_OBSERVATIONS_SYSTEM },
    });
    return res.text ?? null;
  } catch (err) {
    console.warn("[weekly] Gemini unavailable, deterministic voice used:", err);
    return null;
  }
}

export const sundayWeeklyReports = onSchedule(
  {
    schedule: SUNDAY_CRON,
    timeZone: REPORT_TIME_ZONE,
    memory: "256MiB",
    timeoutSeconds: 540,
  },
  async () => {
    const db = getFirestore(initializeApp());
    const now = new Date();
    const weekStart = weekStartFor(now);
    const users = await db.collection("users").get();

    for (const user of users.docs) {
      const uid = user.id;
      try {
        const id = reportIdFor(weekStart);
        const target = db.doc(`users/${uid}/weeklyReports/${id}`);
        if ((await target.get()).exists) {
          console.log(`[weekly] ${uid}: ${id} exists, skipping`);
          continue;
        }

        const snap = await db
          .collection(`users/${uid}/workoutSessions`)
          .orderBy("scheduledDate", "desc")
          .limit(120)
          .get();
        const sessions: SessionFact[] = snap.docs.map((d) => sessionFactFrom(d.data()));
        if (!shouldGenerateReport(sessions)) {
          console.log(`[weekly] ${uid}: no workouts recorded yet, skipping`);
          continue;
        }

        const exercises: ExerciseFact[] = [];
        for (const d of snap.docs) {
          const s = sessionFactFrom(d.data());
          const exSnap = await d.ref.collection("exercises").get();
          for (const e of exSnap.docs) {
            exercises.push(exerciseFactFrom(s.id, s.scheduledDate, e.data()));
          }
        }

        const draft: WeeklyReport = buildWeeklyReport({
          weekStart,
          sessions,
          exercises,
          allTimeExercises: exercises,
          now,
        });
        const report = finalizeReport(draft, await geminiText(draft.facts));
        await target.create({
          ...report,
          createdAt: Timestamp.fromDate(report.createdAt),
        });
        console.log(
          `[weekly] ${uid}: saved ${id} (${report.completed}/${report.planned} workouts)`,
        );
      } catch (err) {
        // One user's failure must never stop the rest of the run.
        console.error(`[weekly] ${uid} failed:`, err);
      }
    }
  },
);

/** Every 5 minutes — slot windows are 15 minutes wide, so a run delayed by
 * jitter still catches its slot and the reminderState guard makes delivery
 * exactly-once. Each device's own timeZone drives its wall clock. */
export const REMINDER_CRON = "*/5 * * * *";

export const sendWorkoutReminders = onSchedule(
  {
    schedule: REMINDER_CRON,
    memory: "256MiB",
    timeoutSeconds: 60,
  },
  async () => {
    const db = getFirestore(initializeApp());
    const now = new Date();
    const users = await db.collection("users").get();

    for (const user of users.docs) {
      const uid = user.id;
      try {
        const profileSnap = await user.ref.collection("settings").doc("profile").get();
        const reminderTimes = (profileSnap.data()?.reminderTimes ?? {}) as Record<string, string>;
        if (Object.keys(reminderTimes).length === 0) continue;

        const tokens = await user.ref.collection("fcmTokens").get();
        for (const t of tokens.docs) {
          const { token, timeZone } = t.data() as { token: string; timeZone: string };
          for (const slot of slotsDue({ reminderTimes, timeZone, now })) {
            const stateSnap = await user.ref.collection("reminderState").doc(t.id).get();
            const lastSlot = stateSnap.data()?.slot as string | undefined;
            if (alreadySent(lastSlot, slot.slot)) continue;

            const msg = buildReminderMessage(slot.dayKey);
            try {
              await getMessaging().send({
                token,
                data: { title: msg.title, body: msg.body, url: "/" },
                webpush: {
                  notification: {
                    title: msg.title,
                    body: msg.body,
                    icon: "/icons/icon-192.png",
                    tag: "workout-reminder",
                  },
                  fcmOptions: { link: "/" },
                },
              });
              const state = reminderStateSchema.parse({
                tokenId: t.id,
                slot: slot.slot,
                sentAt: new Date(),
              });
              await user.ref.collection("reminderState").doc(t.id).set(state);
              console.log(`[reminders] ${uid}/${t.id}: sent ${slot.slot}`);
            } catch (err) {
              const code = (err as { code?: string }).code ?? "";
              if (code.includes("registration-token-not-registered")) {
                // Dead device token — stop sending to it.
                await t.ref.delete();
              }
              console.error(`[reminders] ${uid}/${t.id} send failed:`, err);
            }
          }
        }
      } catch (err) {
        // One user's failure must never stop the rest of the run.
        console.error(`[reminders] ${uid} failed:`, err);
      }
    }
  },
);

/**
 * Boot-failure intake (see docs/BLANK-SCREEN-RUNBOOK.md).
 *
 * The client probe is injected by bootProbePlugin() in vite.config.ts and runs
 * before any app JavaScript, so this endpoint sees exactly the failures the app
 * itself cannot report: a poisoned chunk, a MIME error, a syntax failure, a
 * render crash. Each write lands at bootFailures/{dedupeKey} with a count, so a
 * device stuck in a reload loop cannot grow the collection or the bill.
 *
 * Anonymous by necessity: a pre-React failure has no authenticated session.
 * Reports carry no user data — no uid, email, or workout fields — and the
 * verified token, when one exists, is read for uid only and never trusted from
 * the body. Identity is NOT required, so this is a public write path.
 *
 * App Check is deliberately NOT enforced here, and the platform does not let us
 * ask for it: `enforceAppCheck` is a `CallableOptions` field, and
 * `onRequest` takes `HttpsOptions`, which `Omit`s it (see
 * firebase-functions/lib/v2/providers/https.d.ts). Enforcing App Check on a
 * raw HTTPS function means verifying the token by hand in the handler, which
 * would be a decision to revisit, not a flag to flip.
 *
 * We would not want it anyway. The probe is a dependency-free IIFE inlined into
 * index.html: it cannot import the App Check SDK, so it cannot hold a token, so
 * enforcement would reject precisely the poisoned-chunk and MIME failures this
 * endpoint exists to observe. The controls that do apply here are the Zod
 * length caps, the allow-list that strips unknown fields, the 10-minute dedupe
 * window, and the fact that a report costs one small document. Every other
 * Firebase surface — Auth, Firestore, and the client-side Gemini path in
 * src/coach — IS App Check covered; see src/data/app-check.ts. Blanking this
 * endpoint would trade observability of the worst failure for protection of the
 * least interesting one, so the trade is written down instead of silently taken.
 */
export const reportBootFailure = onRequest(
  {
    memory: "128MiB",
    timeoutSeconds: 20,
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.set("Allow", "POST");
      res.status(405).json({ error: "method-not-allowed" });
      return;
    }

    let raw: unknown;
    try {
      // sendBeacon posts text/plain, so read the raw body rather than relying
      // on body-parser populating req.body.
      const text = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});
      raw = JSON.parse(text);
    } catch {
      res.status(400).json({ error: "invalid-json" });
      return;
    }

    const { report, dedupeKey, accepted, reason } = normalizeBootReport(raw);
    if (!accepted) {
      console.warn("[boot] rejected report:", reason);
      res.status(400).json({ error: "invalid-report" });
      return;
    }

    try {
      const db = getFirestore(initializeApp());
      const ref = db.doc(`bootFailures/${dedupeKey}`);
      // uid from the verified token only; absent for pre-React failures.
      const token = req.get("Authorization")?.replace(/^Bearer /, "") ?? "";
      let uid: string | null = null;
      if (token) {
        try {
          uid = (await getAuth().verifyIdToken(token)).uid;
        } catch {
          uid = null; // expired or invalid tokens are not an error worth failing on
        }
      }

      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const prior = snap.exists ? snap.data() : undefined;
        const count = (prior?.count as number | undefined) ?? 0;
        tx.set(
          ref,
          {
            ...report,
            uid,
            count: count + 1,
            firstSeenAt: prior?.firstSeenAt ?? new Date().toISOString(),
            lastSeenAt: new Date().toISOString(),
          },
          { merge: true },
        );
      });

      console.log(
        `[boot] ${report.stage} on build ${report.buildId} (uid ${uid ?? "anonymous"}): ${report.message}`,
      );
      // 202: accepted and recorded, not necessarily a new document.
      res.status(202).json({ ok: true });
    } catch (err) {
      // Never 5xx loudly enough to retry-storm a broken client.
      console.error("[boot] write failed:", err);
      res.status(202).json({ ok: true });
    }
  },
);
