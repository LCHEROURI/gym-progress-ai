import { TEMPLATES, templateForWeekday, type WorkoutTemplate } from "../domain/templates";
import { weekStartFor } from "../reports/weekly";

/** The slice of a history row the recovery screen needs (structurally fits HistoryRow). */
export interface RecoverySession {
  scheduledDate: string;
  status: "not_started" | "in_progress" | "completed" | "abandoned";
  workoutType: string;
}

export interface RecoveryEntry {
  weekday: string;
  dateLabel: string;
  name: string;
}

export interface RecoveryInfo {
  next: RecoveryEntry;
  last: RecoveryEntry | null;
  week: { completed: number; planned: number };
  tip: string;
}

const iso = (d: Date): string => d.toISOString().slice(0, 10);

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
}

function entry(dateStr: string, name: string): RecoveryEntry {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return {
    weekday: d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }),
    dateLabel: d.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    }),
    name,
  };
}

const nameForType = (workoutType: string): string =>
  TEMPLATES.find((t) => t.workoutType === workoutType)?.name ?? "Workout";

/** Next scheduled training day strictly after `today` (Mon/Wed/Fri, UTC basis). */
export function nextWorkout(today: Date): { date: string; template: WorkoutTemplate } {
  for (let i = 1; i <= 7; i += 1) {
    const date = addDays(iso(today), i);
    const template = templateForWeekday(new Date(`${date}T00:00:00Z`).getUTCDay());
    if (template) return { date, template };
  }
  throw new Error("unreachable: Mon/Wed/Fri always fall within seven days");
}

/** The newest completed session; unfinished sessions never count. */
export function lastCompleted(sessions: RecoverySession[]): RecoveryEntry | null {
  const done = sessions.filter((s) => s.status === "completed");
  if (done.length === 0) return null;
  const newest = done.reduce((a, b) => (a.scheduledDate >= b.scheduledDate ? a : b));
  return entry(newest.scheduledDate, nameForType(newest.workoutType));
}

/** Completed workouts in the Monday-anchored week of `today`, against 3 planned. */
export function weeklyCompletion(
  sessions: RecoverySession[],
  today: Date,
): { completed: number; planned: number } {
  const start = weekStartFor(today);
  const end = addDays(start, 6);
  const done = new Set(
    sessions
      .filter((s) => s.status === "completed" && s.scheduledDate >= start && s.scheduledDate <= end)
      .map((s) => s.scheduledDate),
  );
  return { completed: done.size, planned: 3 };
}

/**
 * Deterministic, personalized recovery guidance — derived only from recorded
 * facts (the brief's "optional AI recovery tip"). Never fabricates.
 */
export function recoveryTip(input: {
  week: { completed: number; planned: number };
  hasLast: boolean;
}): string {
  const { completed, planned } = input.week;
  if (!input.hasLast) {
    return "Your first workout is coming up. An easy walk today is plenty.";
  }
  if (completed >= planned && planned > 0) {
    return `${completed} for ${planned} this week — rest well, you earned it.`;
  }
  if (completed === 0) {
    return "A short walk or easy stretch today keeps the rhythm going.";
  }
  return "Light movement today helps — a short walk or easy stretch.";
}

/** Everything the RECOVERY DAY screen shows, computed from recorded history. */
export function buildRecoveryInfo(sessions: RecoverySession[], today: Date): RecoveryInfo {
  const next = nextWorkout(today);
  const last = lastCompleted(sessions);
  const week = weeklyCompletion(sessions, today);
  return {
    next: entry(next.date, next.template.name),
    last,
    week,
    tip: recoveryTip({ week, hasLast: last !== null }),
  };
}
