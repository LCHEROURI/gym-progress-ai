import type { FirebaseApp } from "firebase/app";
import { GoogleAIBackend, getAI, getGenerativeModel } from "firebase/ai";
import {
  PROMPT_VERSION,
  WEEKLY_OBSERVATIONS_SYSTEM,
  weeklyObservationsPrompt,
} from "../ai/prompts/weekly-observations";
import { DEFAULT_MODEL } from "../coach/explain";
import type { WeeklyReport } from "./weekly";

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

export interface ObservationsResult {
  aiObservations: string[];
  model: string;
  promptVersion: string;
}

/** Gemini comments on the facts; on any failure the deterministic voice stands. */
export async function weeklyObservations(
  app: FirebaseApp,
  report: WeeklyReport,
  model: string = DEFAULT_MODEL,
): Promise<ObservationsResult> {
  const fallback = deterministicObservations(report);
  try {
    const genAI = getAI(app, { backend: new GoogleAIBackend() });
    const gm = getGenerativeModel(genAI, {
      model,
      systemInstruction: WEEKLY_OBSERVATIONS_SYSTEM,
    });
    const res = await gm.generateContent(weeklyObservationsPrompt(report.facts));
    const lines = res.response
      .text()
      .split("\n")
      .map((l) => l.trim().replace(/^[-*\d.]+\s*/, ""))
      .filter(Boolean)
      .map((l) => l.slice(0, 500))
      .slice(0, 10);
    if (lines.length === 0) throw new Error("empty observations");
    return { aiObservations: lines, model, promptVersion: PROMPT_VERSION };
  } catch {
    return {
      aiObservations: fallback,
      model: "deterministic",
      promptVersion: PROMPT_VERSION,
    };
  }
}
