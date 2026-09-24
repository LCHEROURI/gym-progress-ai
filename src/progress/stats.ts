import { TEMPLATES, type ExerciseKind } from "../domain/templates";

export interface SessionFact {
  id: string;
  scheduledDate: string;
  status: "not_started" | "in_progress" | "completed" | "abandoned";
}

export interface ExerciseFact {
  sessionId: string;
  scheduledDate: string;
  exerciseKey: string;
  exerciseName: string;
  completed: boolean;
  weightUsed: number | null;
  difficulty: "easy" | "good" | "hard" | null;
  durationMinutes: number | null;
}

export interface ProgressStats {
  totalWorkouts: number;
  workoutsThisMonth: number;
  currentWeek: { completed: number; planned: number };
  completionRate: number;
  totalCardioMinutes: number;
}

export interface PersonalRecord {
  exerciseKey: string;
  exerciseName: string;
  weight: number;
  achievedAt: string;
  sessionId: string;
}

export interface ExerciseProgress {
  exerciseKey: string;
  exerciseName: string;
  startingWeight: number | null;
  currentWeight: number | null;
  highestWeight: number | null;
  totalSessions: number;
  latestResult: string;
  trend: "up" | "flat" | "down";
  points: { date: string; weight: number }[];
}

const kindByKey = new Map<string, ExerciseKind>(
  TEMPLATES.flatMap((t) => t.exercises).map((e) => [e.key, e.kind]),
);

const iso = (d: Date): string => d.toISOString().slice(0, 10);

function mondayOf(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  out.setUTCDate(out.getUTCDate() - ((out.getUTCDay() + 6) % 7));
  return out;
}

function monthPrefix(d: Date): string {
  return iso(d).slice(0, 7);
}

/** Mon/Wed/Fri dates of `today`'s month that fall on or before `today`. */
export function scheduledCountThroughToday(today: Date): number {
  let count = 0;
  const cursor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const end = new Date(today);
  end.setUTCHours(23, 59, 59, 999);
  while (cursor <= end) {
    const day = cursor.getUTCDay();
    if (day === 1 || day === 3 || day === 5) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

export function buildProgressStats(input: {
  sessions: SessionFact[];
  exercises: ExerciseFact[];
  today: Date;
}): ProgressStats {
  const completed = input.sessions.filter((s) => s.status === "completed");
  const month = monthPrefix(input.today);
  const weekStart = iso(mondayOf(input.today));

  const workoutsThisMonth = completed.filter((s) => s.scheduledDate.startsWith(month)).length;
  const weekDone = completed.filter(
    (s) => s.scheduledDate >= weekStart && s.scheduledDate <= iso(input.today),
  ).length;
  const scheduled = scheduledCountThroughToday(input.today);
  const monthDone = completed.filter(
    (s) => s.scheduledDate >= `${month}-01` && s.scheduledDate <= iso(input.today),
  ).length;

  const totalCardioMinutes = input.exercises
    .filter((e) => e.completed && kindByKey.get(e.exerciseKey) === "cardio")
    .reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);

  return {
    totalWorkouts: completed.length,
    workoutsThisMonth,
    currentWeek: { completed: weekDone, planned: 3 },
    completionRate: scheduled > 0 ? monthDone / scheduled : 0,
    totalCardioMinutes,
  };
}

/**
 * PR = the first session to reach a weight no later session beats.
 * Ties are not PRs; only strictly higher weight counts (never fabricate).
 */
export function detectPersonalRecords(exercises: ExerciseFact[]): PersonalRecord[] {
  const byKey = new Map<string, ExerciseFact[]>();
  for (const f of exercises) {
    if (!f.completed || f.weightUsed === null) continue;
    const list = byKey.get(f.exerciseKey) ?? [];
    list.push(f);
    byKey.set(f.exerciseKey, list);
  }
  const prs: PersonalRecord[] = [];
  for (const [key, list] of byKey) {
    const asc = [...list].sort((a, b) =>
      a.scheduledDate === b.scheduledDate ? 0 : a.scheduledDate < b.scheduledDate ? -1 : 1,
    );
    let best: ExerciseFact | null = null;
    for (const f of asc) {
      if (!best || (f.weightUsed ?? 0) > (best.weightUsed ?? 0)) best = f;
    }
    if (best) {
      prs.push({
        exerciseKey: key,
        exerciseName: best.exerciseName,
        weight: best.weightUsed ?? 0,
        achievedAt: best.scheduledDate,
        sessionId: best.sessionId,
      });
    }
  }
  return prs.sort((a, b) => b.weight - a.weight);
}

export function buildExerciseProgress(exercises: ExerciseFact[]): ExerciseProgress[] {
  const byKey = new Map<string, ExerciseFact[]>();
  for (const f of exercises) {
    if (f.weightUsed === null) continue;
    const list = byKey.get(f.exerciseKey) ?? [];
    list.push(f);
    byKey.set(f.exerciseKey, list);
  }
  const out: ExerciseProgress[] = [];
  for (const [key, list] of byKey) {
    const asc = [...list].sort((a, b) =>
      a.scheduledDate === b.scheduledDate ? 0 : a.scheduledDate < b.scheduledDate ? -1 : 1,
    );
    const points = asc.map((f) => ({ date: f.scheduledDate, weight: f.weightUsed ?? 0 }));
    const first = asc[0];
    const latest = asc[asc.length - 1];
    const prev = asc.length > 1 ? asc[asc.length - 2] : null;
    out.push({
      exerciseKey: key,
      exerciseName: latest.exerciseName,
      startingWeight: first.weightUsed,
      currentWeight: latest.weightUsed,
      highestWeight: Math.max(...points.map((p) => p.weight)),
      totalSessions: new Set(asc.map((f) => f.sessionId)).size,
      latestResult: `${latest.weightUsed} lb · ${latest.difficulty ?? "not rated"}`,
      trend:
        prev === null || prev.weightUsed === latest.weightUsed
          ? "flat"
          : (latest.weightUsed ?? 0) > (prev.weightUsed ?? 0)
            ? "up"
            : "down",
      points,
    });
  }
  return out.sort((a, b) => a.exerciseKey.localeCompare(b.exerciseKey));
}
