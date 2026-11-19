import type { FirebaseApp } from "firebase/app";
import { GoogleAIBackend, getAI, getGenerativeModel } from "firebase/ai";
import {
  PROMPT_VERSION,
  WEIGHT_EXPLANATION_SYSTEM,
  weightExplanationPrompt,
} from "../ai/prompts/weight-explanation";
import { appCheckStatus } from "../data/app-check";
import { classifyCoachError, type CoachDiagnostic } from "./diagnostics";

/** Resolved from settings/Remote Config later; one place to change (AGENTS.md). */
export const DEFAULT_MODEL = "gemini-3.8-flash";

export type ExplanationSource = "model" | "deterministic";

export interface Explanation {
  reason: string;
  /** "model" only when Gemini produced the text; anything else is app-computed. */
  source: ExplanationSource;
  /** Safe, app-owned failure copy. Null when the model call succeeded. */
  diagnostic: CoachDiagnostic | null;
  model: string;
  promptVersion: string;
}

/**
 * Gemini may only rephrase the deterministic reason — it never changes numbers.
 * If the model is unavailable (offline, unprovisioned, refused), the
 * deterministic reason stands on its own with a safe diagnostic so the UI can
 * label the fallback honestly.
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
    if (!text) {
      const diagnostic: CoachDiagnostic = {
        category: "model",
        detail: "The AI service returned an empty answer. Try again shortly.",
      };
      console.warn("[coach] Gemini explanation returned no text", {
        category: diagnostic.category,
        detail: diagnostic.detail,
        model,
        promptVersion: PROMPT_VERSION,
      });
      return {
        reason: fallbackReason,
        source: "deterministic",
        diagnostic,
        model: "deterministic",
        promptVersion: PROMPT_VERSION,
      };
    }
    return {
      reason: text,
      source: "model",
      diagnostic: null,
      model,
      promptVersion: PROMPT_VERSION,
    };
  } catch (error) {
    const diagnostic = classifyCoachError(error, appCheckStatus());
    console.warn("[coach] Gemini explanation failed", {
      category: diagnostic.category,
      detail: diagnostic.detail,
      ...(diagnostic.code ? { code: diagnostic.code } : {}),
      ...(diagnostic.hint ? { hint: diagnostic.hint } : {}),
      model,
      promptVersion: PROMPT_VERSION,
    });
    return {
      reason: fallbackReason,
      source: "deterministic",
      diagnostic,
      model: "deterministic",
      promptVersion: PROMPT_VERSION,
    };
  }
}
