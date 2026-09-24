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
import { getFirestore, Timestamp } from "firebase-admin/firestore";
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
