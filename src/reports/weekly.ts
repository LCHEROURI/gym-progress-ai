import { z } from "zod";
import { TEMPLATES } from "../domain/templates";
import type { ExerciseFact, SessionFact } from "../progress/stats";
import { detectPersonalRecords } from "../progress/stats";

/** Mirrors the weeklyReports rules exactly (append-only after create). */
export const weeklyReportSchema = z
  .object({
    weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    weekEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    planned: z.number().int().min(0).max(7),
    completed: z.number().int().min(0).max(7),
    completionRate: z.number().min(0).max(1),
    strengthChanges: z
      .array(z.object({ exerciseKey: z.string().max(60), from: z.number().min(0).max(2000), to: z.number().min(0).max(2000) }))
      .max(40),
    cardioMinutes: z.number().min(0).max(10000),
    prs: z
      .array(z.object({ exerciseKey: z.string().max(60), weight: z.number().min(0).max(2000), date: z.string().max(10) }))
      .max(40),
    missed: z.array(z.string().max(10)).max(7),
    facts: z.record(z.unknown()).refine((m) => Object.keys(m).length <= 60, {
      message: "facts may hold at most 60 entries",
    }),
    aiObservations: z.array(z.string().max(500)).max(10),
    nextWeek: z
      .array(z.object({ exerciseKey: z.string().max(60), guidance: z.string().max(300) }))
      .max(20),
    createdAt: z.date(),
  })
  .strict();

export type WeeklyReport = z.infer<typeof weeklyReportSchema>;

const kindByKey = new Map(
  TEMPLATES.flatMap((t) => t.exercises).map((e) => [e.key, e.kind]),
);

const iso = (d: Date): string => d.toISOString().slice(0, 10);

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
}

/** ISO Monday of `today`'s week (UTC basis). */
export function weekStartFor(today: Date): string {
  const d = new Date(today);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return iso(d);
}

/** The most recent week whose Sunday already passed — the reportable week. */
export function latestCompletedWeekStart(today: Date): string {
  return addDays(weekStartFor(today), -7);
}

/** Scheduled Mon/Wed/Fri dates inside a Monday-anchored week. */
export function scheduledDates(weekStart: string): string[] {
  return [0, 2, 4].map((offset) => addDays(weekStart, offset));
}

/**
 * Deterministic weekly aggregation (PROJECT-SPEC "weekly report"). Every
 * number is computed here from recorded facts; Gemini only comments on them.
 * Monday-anchored week: weekStart is a YYYY-MM-DD Monday.
 */
export function buildWeeklyReport(input: {
  weekStart: string;
  sessions: SessionFact[];
  exercises: ExerciseFact[];
  allTimeExercises?: ExerciseFact[];
  now?: Date;
}): WeeklyReport {
  const weekEnd = addDays(input.weekStart, 6);
  const inWeek = (date: string) => date >= input.weekStart && date <= weekEnd;

  const plannedDates = scheduledDates(input.weekStart);
  const completedDates = new Set(
    input.sessions
      .filter((s) => s.status === "completed" && inWeek(s.scheduledDate))
      .map((s) => s.scheduledDate),
  );
  const completed = completedDates.size;
  const planned = plannedDates.length;
  const missed = plannedDates.filter((d) => !completedDates.has(d));

  const weekFacts = input.exercises.filter((e) => inWeek(e.scheduledDate));
  const doneFacts = weekFacts.filter((e) => e.completed);

  const cardioMinutes = doneFacts
    .filter((e) => kindByKey.get(e.exerciseKey) === "cardio")
    .reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);

  const byKey = new Map<string, ExerciseFact[]>();
  for (const f of doneFacts) {
    if (f.weightUsed === null) continue;
    const list = byKey.get(f.exerciseKey) ?? [];
    list.push(f);
    byKey.set(f.exerciseKey, list);
  }
  const strengthChanges = [...byKey.entries()]
    .map(([key, list]) => {
      const asc = [...list].sort((a, b) => (a.scheduledDate <= b.scheduledDate ? -1 : 1));
      return {
        exerciseKey: key,
        from: asc[0].weightUsed ?? 0,
        to: asc[asc.length - 1].weightUsed ?? 0,
      };
    })
    .sort((a, b) => a.exerciseKey.localeCompare(b.exerciseKey));

  // A weekly PR must beat prior history — a first-ever lift is not a record.
  const priorBest = new Map<string, number>();
  for (const f of input.allTimeExercises ?? input.exercises) {
    if (inWeek(f.scheduledDate) || !f.completed || f.weightUsed === null) continue;
    priorBest.set(f.exerciseKey, Math.max(priorBest.get(f.exerciseKey) ?? 0, f.weightUsed));
  }
  const prs = detectPersonalRecords(input.allTimeExercises ?? input.exercises)
    .filter(
      (pr) =>
        inWeek(pr.achievedAt) &&
        priorBest.has(pr.exerciseKey) &&
        pr.weight > (priorBest.get(pr.exerciseKey) ?? 0),
    )
    .map((pr) => ({ exerciseKey: pr.exerciseKey, weight: pr.weight, date: pr.achievedAt }));

  const nextWeek = strengthChanges.map(({ exerciseKey, from, to }) => ({
    exerciseKey,
    guidance:
      to > from
        ? `Consider maintaining ${to} lb until it feels comfortable.`
        : to < from
          ? `Keep ${to} lb and rebuild toward ${from} lb when all sets feel comfortable.`
          : `Consider a small increase if target repetitions remain comfortable.`,
  }));

  const completionRate = planned > 0 ? completed / planned : 0;

  return weeklyReportSchema.parse({
    weekStart: input.weekStart,
    weekEnd,
    planned,
    completed,
    completionRate,
    strengthChanges,
    cardioMinutes,
    prs,
    missed,
    facts: {
      planned,
      completed,
      completionRate,
      cardioMinutes,
      prCount: prs.length,
      missedCount: missed.length,
      strengthChangeCount: strengthChanges.filter((c) => c.from !== c.to).length,
    },
    aiObservations: [],
    nextWeek,
    createdAt: input.now ?? new Date(),
  });
}
