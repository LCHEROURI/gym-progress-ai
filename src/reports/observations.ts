import type { FirebaseApp } from "firebase/app";
import { GoogleAIBackend, getAI, getGenerativeModel } from "firebase/ai";
import {
  PROMPT_VERSION,
  WEEKLY_OBSERVATIONS_SYSTEM,
  weeklyObservationsPrompt,
} from "../ai/prompts/weekly-observations";
import { DEFAULT_MODEL } from "../coach/explain";
import {
  cleanObservationLines,
  deterministicObservations,
} from "./observations-core";
import type { WeeklyReport } from "./weekly";

// Re-exported for compatibility: the pure implementations live in
// observations-core.ts so the Sunday Cloud Function can share them.
export { deterministicObservations };

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
    const lines = cleanObservationLines(res.response.text());
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
