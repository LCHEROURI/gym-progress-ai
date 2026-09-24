import type { ExerciseFact, SessionFact } from "../progress/stats";

export type Effort = "easy" | "good" | "hard";

export interface QuickChip {
  label: string;
  message: string;
}

/** The brief's original quick questions (no feedback yet → unchanged chips). */
export const DEFAULT_CHIPS: QuickChip[] = [
  "What weight should I use today?",
  "How am I progressing on leg press?",
  "Which exercise has improved most?",
  "Which exercise has stalled?",
  "How many workouts did I complete this month?",
  "How much cardio did I do?",
  "What should I focus on next week?",
].map((q) => ({ label: q, message: q }));

/** weight today, stalled, focus — the generals kept alongside effort chips. */
const FOLLOWUPS: QuickChip[] = [DEFAULT_CHIPS[0], DEFAULT_CHIPS[3], DEFAULT_CHIPS[6]];

const LEAD_CHIPS: Record<Effort, QuickChip[]> = {
  easy: [
    {
      label: "What should I increase next workout?",
      message:
        "My last workout felt easy. Which exercises are ready for a small increase next workout?",
    },
    {
      label: "Make my next workout harder",
      message:
        "My last workout felt easy. How can I make my next workout a little harder?",
    },
  ],
  good: [
    {
      label: "Repeat next workout as-is?",
      message:
        "My last workout felt good. Should I keep the same weights next workout?",
    },
    {
      label: "Which weights are ready to progress?",
      message:
        "My last workout felt good. Which exercises are ready for a small increase next workout?",
    },
  ],
  hard: [
    {
      label: "Plan a lighter next workout",
      message:
        "My last workout felt hard. How should I ease off for my next workout?",
    },
    {
      label: "What should I keep steady?",
      message:
        "My last workout felt hard. Which exercises should I keep steady or lighten next workout?",
    },
  ],
};

/**
 * Last session's EASY/GOOD/HARD feedback, conservatively aggregated from the
 * completed exercises' ratings: anything rated hard means hard; "easy" only
 * when every rating was easy; otherwise "good". Null when nothing was rated.
 * Sessions are attributed by scheduledDate and may arrive in any order.
 */
export function lastEffortFeedback(input: {
  sessions: SessionFact[];
  exercises: ExerciseFact[];
}): Effort | null {
  const last = input.sessions
    .filter((s) => s.status === "completed")
    .reduce<SessionFact | null>(
      (best, s) => (!best || s.scheduledDate > best.scheduledDate ? s : best),
      null,
    );
  if (!last) return null;
  const ratings = input.exercises
    .filter(
      (e) => e.sessionId === last.id && e.completed && e.difficulty !== null,
    )
    .map((e) => e.difficulty as Exclude<ExerciseFact["difficulty"], null>);
  if (ratings.length === 0) return null;
  if (ratings.includes("hard")) return "hard";
  if (ratings.every((r) => r === "easy")) return "easy";
  return "good";
}

/** Workout-suggestion chips first, based on how the last session felt. */
export function suggestQuickChips(lastEffort: Effort | null): QuickChip[] {
  if (!lastEffort) return DEFAULT_CHIPS;
  return [...LEAD_CHIPS[lastEffort], ...FOLLOWUPS];
}
