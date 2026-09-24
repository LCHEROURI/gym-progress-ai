import type { WeeklyReport } from "./weekly";

/**
 * Parse model output into bounded observation lines. Shared by the client
 * Firebase AI Logic transport and the Sunday Cloud Function so both clean
 * output identically.
 */
export function cleanObservationLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim().replace(/^[-*\d.]+\s*/, ""))
    .filter(Boolean)
    .map((l) => l.slice(0, 500))
    .slice(0, 10);
}

/**
 * Deterministic fallback voice (the brief's example sentences) — used when
 * Gemini is unavailable. Never fabricates: derived from the same facts.
 */
export function deterministicObservations(report: WeeklyReport): string[] {
  const out: string[] = [];
  const increases = report.strengthChanges.filter((c) => c.to > c.from);
  const stable = report.strengthChanges.filter((c) => c.to === c.from);

  if (report.completed >= report.planned && report.planned > 0) {
    out.push("You completed all scheduled workouts this week.");
  } else if (report.missed.length > 0) {
    out.push(`You missed ${report.missed.length} scheduled workout${report.missed.length > 1 ? "s" : ""}. Next week is a fresh start.`);
  }
  if (increases.length > 0) {
    out.push(`You increased resistance on ${increases.length} exercise${increases.length > 1 ? "s" : ""}.`);
  }
  if (stable.length > 0) {
    out.push(
      `${stable.map((s) => s.exerciseKey.replace(/-/g, " ")).join(" and ")} remained stable.`,
    );
  }
  return out.slice(0, 10);
}
