import type { ExerciseFact, SessionFact } from "../progress/stats";
import { buildExerciseProgress, buildProgressStats } from "../progress/stats";
import type { ClassifiedQuestion, CoachIntent } from "./intent";
import { lastEffortFeedback } from "./chips";

export interface CoachContext {
  intent: CoachIntent;
  exerciseKey: string | null;
  facts: Record<string, unknown>;
  summaryLines: string[];
  insufficient: boolean;
}

/**
 * Pipeline steps 2-3: retrieve only what the intent needs and compute every
 * number in code. The model later interprets these facts — never invents them.
 */
export function buildCoachContext(input: {
  classified: ClassifiedQuestion;
  sessions: SessionFact[];
  exercises: ExerciseFact[];
  today: Date;
}): CoachContext {
  const { classified } = input;
  const completed = input.sessions.filter((s) => s.status === "completed");
  const base: CoachContext = {
    intent: classified.intent,
    exerciseKey: classified.exerciseKey,
    facts: {},
    summaryLines: [],
    insufficient: completed.length === 0,
  };
  if (base.insufficient) return base;

  const month = input.today.toISOString().slice(0, 7);
  const progress = buildExerciseProgress(input.exercises);
  const stats = buildProgressStats({
    sessions: input.sessions,
    exercises: input.exercises,
    today: input.today,
  });
  const monthFacts = input.exercises.filter((e) => e.completed && e.scheduledDate.startsWith(month));
  const cardioThisMonth = monthFacts.reduce(
    (sum, e) => sum + (e.durationMinutes ?? 0),
    0,
  );

  switch (classified.intent) {
    case "workoutsCount": {
      const facts = {
        totalWorkouts: stats.totalWorkouts,
        workoutsThisMonth: stats.workoutsThisMonth,
        month,
      };
      return {
        ...base,
        facts,
        summaryLines: [
          `You completed ${stats.workoutsThisMonth} workouts this month (${stats.totalWorkouts} in total).`,
        ],
      };
    }
    case "cardio": {
      const facts = { cardioMinutesThisMonth: cardioThisMonth, totalCardioMinutes: stats.totalCardioMinutes, month };
      return {
        ...base,
        facts,
        summaryLines: [
          `You logged ${cardioThisMonth} cardio minutes this month (${stats.totalCardioMinutes} in total).`,
        ],
      };
    }
    case "progress": {
      const row = progress.find((p) => p.exerciseKey === classified.exerciseKey);
      if (!row) return { ...base, insufficient: true };
      const facts = {
        exerciseKey: row.exerciseKey,
        startingWeight: row.startingWeight,
        currentWeight: row.currentWeight,
        highestWeight: row.highestWeight,
        totalSessions: row.totalSessions,
        trend: row.trend,
        points: row.points,
      };
      return {
        ...base,
        facts,
        summaryLines: [
          `${row.exerciseName}: ${row.startingWeight} lb → ${row.currentWeight} lb over ${row.totalSessions} sessions (trend ${row.trend}, best ${row.highestWeight} lb).`,
        ],
      };
    }
    case "mostImproved": {
      const ranking = [...progress]
        .map((p) => ({
          exerciseKey: p.exerciseKey,
          exerciseName: p.exerciseName,
          delta: (p.currentWeight ?? 0) - (p.startingWeight ?? 0),
        }))
        .sort((a, b) => b.delta - a.delta);
      const top = ranking[0];
      return {
        ...base,
        facts: { ranking },
        summaryLines: top
          ? [`Most improved: ${top.exerciseName}, ${top.delta >= 0 ? "+" : ""}${top.delta} lb since your first session.`]
          : [],
      };
    }
    case "stalled": {
      const stalled = progress
        .filter((p) => p.trend === "flat" && p.totalSessions >= 2)
        .map((p) => ({ exerciseKey: p.exerciseKey, exerciseName: p.exerciseName, totalSessions: p.totalSessions }));
      return {
        ...base,
        facts: { stalled },
        summaryLines: stalled.length
          ? [`Stalled: ${stalled.map((s) => s.exerciseName).join(", ")} (flat across recent sessions).`]
          : ["Nothing has stalled — every tracked machine is still moving."],
      };
    }
    case "nextWorkout": {
      const lastEffort = lastEffortFeedback(input);
      const latestByKey = new Map<string, ExerciseFact>();
      for (const f of input.exercises.filter((e) => e.completed)) {
        const cur = latestByKey.get(f.exerciseKey);
        if (!cur || f.scheduledDate > cur.scheduledDate) {
          latestByKey.set(f.exerciseKey, f);
        }
      }
      const plan = progress.map((p) => {
        const difficulty = latestByKey.get(p.exerciseKey)?.difficulty ?? null;
        const advice =
          difficulty === "easy"
            ? "increase-ok"
            : difficulty === "good"
              ? "keep-or-nudge"
              : difficulty === "hard"
                ? "keep"
                : "rate-it";
        return {
          exerciseKey: p.exerciseKey,
          exerciseName: p.exerciseName,
          lastWeight: p.currentWeight,
          lastDifficulty: difficulty,
          advice,
        };
      });
      const line = (m: (typeof plan)[number]) =>
        m.advice === "increase-ok"
          ? `${m.exerciseName}: ${m.lastWeight} lb felt easy — consider a small increase.`
          : m.advice === "keep-or-nudge"
            ? `${m.exerciseName}: ${m.lastWeight} lb felt good — keep it or nudge up if all sets felt comfortable.`
            : m.advice === "keep"
              ? `${m.exerciseName}: ${m.lastWeight} lb felt hard — keep it steady next workout.`
              : `${m.exerciseName}: ${m.lastWeight} lb last time — keep it and rate how it feels.`;
      return {
        ...base,
        facts: { lastEffort, plan },
        summaryLines: plan.map(line),
      };
    }
    case "weightToday": {
      const machines = progress.map((p) => ({
        exerciseKey: p.exerciseKey,
        exerciseName: p.exerciseName,
        lastWeight: p.currentWeight,
        lastResult: p.latestResult,
        trend: p.trend,
      }));
      return {
        ...base,
        facts: { machines },
        summaryLines: machines.map(
          (m) => `${m.exerciseName} last used ${m.lastWeight} lb (${m.lastResult}).`,
        ),
      };
    }
    case "focus": {
      const up = progress.filter((p) => p.trend === "up").map((p) => p.exerciseName);
      const flat = progress.filter((p) => p.trend === "flat").map((p) => p.exerciseName);
      const facts = {
        trendingUp: up,
        flat,
        missedThisMonth: stats.completionRate < 1,
        completionRate: stats.completionRate,
      };
      const line = flat.length
        ? `Focus next week on ${flat.join(", ")} — keep the weight steady and finish all sets at target.`
        : "Everything is trending up — keep doing exactly what you are doing.";
      return { ...base, facts, summaryLines: [line] };
    }
    default: {
      const facts = {
        totalWorkouts: stats.totalWorkouts,
        workoutsThisMonth: stats.workoutsThisMonth,
        currentWeek: stats.currentWeek,
        totalCardioMinutes: stats.totalCardioMinutes,
      };
      return {
        ...base,
        facts,
        summaryLines: [
          `You completed ${stats.totalWorkouts} workouts and ${stats.totalCardioMinutes} cardio minutes so far.`,
        ],
      };
    }
  }
}
