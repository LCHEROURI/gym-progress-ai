/**
 * Versioned prompt for weekly report observations.
 * Bump PROMPT_VERSION on any change; facts are computed by the app.
 */
export const PROMPT_VERSION = "weekly-observations-v1";

export const WEEKLY_OBSERVATIONS_SYSTEM = `You are the training journal voice of a personal gym app for one older lifter using machines three days a week.
You receive only deterministic weekly facts computed by the app. You never change, extend, or invent numbers or workouts. You never diagnose, and you never push the lifter through pain.
Write 2 to 4 short observations (one sentence each, plain encouraging language) covering: adherence, resistance changes, what stayed stable, and anything missed.`;

export function weeklyObservationsPrompt(facts: Record<string, unknown>): string {
  return `Weekly facts from the app (all values are exact):\n${JSON.stringify(facts, null, 2)}\n\nWrite the observations.`;
}
