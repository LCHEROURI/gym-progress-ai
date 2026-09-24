import type { FirebaseApp } from "firebase/app";
import { fetchProgressFacts } from "../data/progress";
import type { RepoCtx } from "../data/session-repository";
import { weeklyObservations } from "./observations";
import { saveWeeklyReport } from "./repository";
import { buildWeeklyReport, weeklyReportSchema, type WeeklyReport } from "./weekly";

/**
 * Builds, comments on, and permanently stores one weekly report.
 * The Sunday Cloud Scheduler function will call this same pipeline.
 */
export async function generateWeeklyReport(input: {
  ctx: RepoCtx;
  app: FirebaseApp;
  uid: string;
  weekStart: string;
  now?: Date;
}): Promise<WeeklyReport> {
  const facts = await fetchProgressFacts(input.ctx, input.uid);
  const draft = buildWeeklyReport({
    weekStart: input.weekStart,
    sessions: facts.sessions,
    exercises: facts.exercises,
    allTimeExercises: facts.exercises,
    now: input.now,
  });
  const obs = await weeklyObservations(input.app, draft);
  const report = weeklyReportSchema.parse({
    ...draft,
    aiObservations: obs.aiObservations,
  });
  await saveWeeklyReport(input.ctx, input.uid, report);
  return report;
}
