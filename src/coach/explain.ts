import type { FirebaseApp } from "firebase/app";
import { GoogleAIBackend, getAI, getGenerativeModel } from "firebase/ai";
import {
  PROMPT_VERSION,
  WEIGHT_EXPLANATION_SYSTEM,
  weightExplanationPrompt,
} from "../ai/prompts/weight-explanation";

/** Resolved from settings/Remote Config later; one place to change (AGENTS.md). */
export const DEFAULT_MODEL = "gemini-2.5-flash";

export interface Explanation {
  reason: string;
  model: string;
  promptVersion: string;
}

/**
 * Gemini may only rephrase the deterministic reason — it never changes numbers.
 * If the model is unavailable (offline, unprovisioned), the deterministic reason
 * stands on its own.
 */
export async function explainSuggestion(
  app: FirebaseApp,
  facts: Record<string, unknown>,
  fallbackReason: string,
  model: string = DEFAULT_MODEL,
): Promise<Explanation> {
  try {
    const genAI = getAI(app, { backend: new GoogleAIBackend() });
    const gm = getGenerativeModel(genAI, {
      model,
      systemInstruction: WEIGHT_EXPLANATION_SYSTEM,
    });
    const res = await gm.generateContent(weightExplanationPrompt(facts));
    const text = res.response.text().trim().slice(0, 500);
    if (!text) throw new Error("empty explanation");
    return { reason: text, model, promptVersion: PROMPT_VERSION };
  } catch {
    return {
      reason: fallbackReason,
      model: "deterministic",
      promptVersion: PROMPT_VERSION,
    };
  }
}
