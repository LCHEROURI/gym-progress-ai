import { addDays, scheduledDates, weekStartFor } from "../reports/weekly";

export interface Celebration {
  title: string;
  body: string;
  perfectWeek: boolean;
  streakWeeks: number;
}

function isPerfectWeek(weekStart: string, completed: Set<string>): boolean {
  return scheduledDates(weekStart).every((d) => completed.has(d));
}

/** Consecutive perfect weeks walking back from `weekStart`. */
function streakEndingAt(weekStart: string, completed: Set<string>): number {
  let streak = 0;
  let ws: string | null = weekStart;
  while (ws !== null && isPerfectWeek(ws, completed)) {
    streak += 1;
    ws = addDays(ws, -7);
  }
  return streak;
}

/**
 * Weekly workout streak: consecutive perfect weeks (every Mon/Wed/Fri session
 * completed, attributed by scheduledDate exactly like the weekly report). Ends
 * at the current week once it is perfect; otherwise at last week — the streak
 * this week's remaining workouts can keep alive.
 */
export function perfectWeekStreak(
  completedDates: Iterable<string>,
  today: Date,
): number {
  const completed = new Set(completedDates);
  const thisWeek = weekStartFor(today);
  return isPerfectWeek(thisWeek, completed)
    ? streakEndingAt(thisWeek, completed)
    : streakEndingAt(addDays(thisWeek, -7), completed);
}

/**
 * Deterministic celebration copy for a just-completed session. Every number is
 * computed here from recorded dates, never estimated.
 */
export function buildCelebration(input: {
  completedDates: Iterable<string>;
  today: Date;
}): Celebration {
  const completed = new Set(input.completedDates);
  const thisWeek = weekStartFor(input.today);
  const planned = scheduledDates(thisWeek);
  const doneThisWeek = planned.filter((d) => completed.has(d)).length;
  const perfectWeek = doneThisWeek === planned.length;
  const streakWeeks = perfectWeekStreak(completed, input.today);

  if (perfectWeek) {
    return {
      title: "PERFECT WEEK!",
      body:
        streakWeeks >= 2
          ? `${streakWeeks} weeks in a row with all 3 workouts. 🔥`
          : "All 3 workouts done this week. Start a streak!",
      perfectWeek,
      streakWeeks,
    };
  }
  const left = planned.length - doneThisWeek;
  return {
    title: "WORKOUT SAVED!",
    body:
      streakWeeks >= 1
        ? `${doneThisWeek} of ${planned.length} workouts this week — ${left} more to keep your ${streakWeeks}-week streak alive.`
        : `${doneThisWeek} of ${planned.length} workouts this week.`,
    perfectWeek,
    streakWeeks,
  };
}
