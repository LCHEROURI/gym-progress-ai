import type { FirebaseApp } from "firebase/app";
import { GoogleAIBackend, getAI, getGenerativeModel } from "firebase/ai";
import { COACH_SYSTEM, PROMPT_VERSION, coachPrompt } from "../ai/prompts/coach-chat";
import { appCheckStatus } from "../data/app-check";
import { classifyCoachError, type CoachDiagnostic } from "./diagnostics";
import { DEFAULT_MODEL } from "./explain";
import type { CoachContext } from "./context";

export const INSUFFICIENT_HISTORY = "I don't have enough workout history yet.";

export type CoachAnswerSource = "model" | "deterministic";

export interface CoachAnswer {
  text: string;
  /** "model" only when Gemini produced the text; anything else is app-computed. */
  source: CoachAnswerSource;
  /** Safe, app-owned failure copy. Null when the model call succeeded. */
  diagnostic: CoachDiagnostic | null;
  model: string | null;
  promptVersion: string | null;
}

export interface CoachMessage {
  role: "user" | "model";
  text: string;
  /** Set on model messages so the screen can label non-Gemini answers. */
  source?: CoachAnswerSource;
  diagnostic?: CoachDiagnostic;
}

export function deterministicAnswer(context: CoachContext): string {
  return context.summaryLines.join(" ") || INSUFFICIENT_HISTORY;
}

/**
 * `@firebase/ai` validates that chat history starts with `user`, strictly
 * alternates `user` ↔ `model`, and has non-empty parts. Because `sendMessage`
 * appends the next `user` turn, any failed prior turn that left a dangling
 * `user` message (or duplicate same-role turns) must be normalized into
 * complete `user` → `model` pairs before calling `startChat`.
 */
function sanitizeChatHistory(
  history?: CoachMessage[],
): Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> {
  const normalized: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];
  for (const m of history ?? []) {
    const text = m.text.trim();
    if (!text) continue;
    const prev = normalized[normalized.length - 1];
    if (!prev) {
      if (m.role === "user") {
        normalized.push({ role: "user", parts: [{ text }] });
      }
      continue;
    }
    if (m.role === prev.role) {
      // Consecutive user messages happen when an earlier turn failed before
      // producing a reply; keep the latest user turn. Ignore duplicate model turns.
      if (m.role === "user") {
        normalized[normalized.length - 1] = { role: "user", parts: [{ text }] };
      }
      continue;
    }
    normalized.push({ role: m.role, parts: [{ text }] });
  }
  // Drop any trailing unpaired `user` message so `sendMessage` never creates
  // two consecutive `user` turns.
  if (normalized.length > 0 && normalized[normalized.length - 1].role === "user") {
    normalized.pop();
  }
  return normalized;
}

/**
 * Pipeline steps 4-6: send only the computed facts to Gemini, ask for the
 * interpretation, return it. No facts → the exact insufficient-history line,
 * without calling the model at all.
 *
 * Failure contract: askCoach never throws for a model-level failure. Instead
 * it returns the deterministic answer with `source: "deterministic"` and a
 * safe diagnostic so the UI can label the reply as not coming from Gemini.
 * Only `{ category, detail }` is logged — never the raw provider payload.
 */
export async function askCoach(input: {
  app: FirebaseApp;
  question: string;
  context: CoachContext;
  history?: CoachMessage[];
  model?: string;
}): Promise<CoachAnswer> {
  if (input.context.insufficient) {
    return {
      text: INSUFFICIENT_HISTORY,
      source: "deterministic",
      diagnostic: null,
      model: null,
      promptVersion: null,
    };
  }
  const model = input.model ?? DEFAULT_MODEL;
  try {
    const genAI = getAI(input.app, { backend: new GoogleAIBackend() });
    const gm = getGenerativeModel(genAI, { model, systemInstruction: COACH_SYSTEM });
    const chat = gm.startChat({
      history: sanitizeChatHistory(input.history),
    });
    const res = await chat.sendMessage(coachPrompt(input.context.facts, input.question));
    const text = res.response.text().trim();
    if (!text) {
      const diagnostic: CoachDiagnostic = {
        category: "model",
        detail: "The AI service returned an empty answer. Try again shortly.",
      };
      console.warn("[coach] Gemini returned no text", {
        category: diagnostic.category,
        detail: diagnostic.detail,
        model,
        promptVersion: PROMPT_VERSION,
      });
      return {
        text: deterministicAnswer(input.context),
        source: "deterministic",
        diagnostic,
        model,
        promptVersion: PROMPT_VERSION,
      };
    }
    return {
      text: text.slice(0, 2000),
      source: "model",
      diagnostic: null,
      model,
      promptVersion: PROMPT_VERSION,
    };
  } catch (error) {
    const diagnostic = classifyCoachError(error, appCheckStatus());
    // Structured and safe by construction: category + fixed copy, the error's
    // own code, and a sanitized hint. The raw error is never logged or shown
    // (see src/coach/diagnostics.ts).
    console.warn("[coach] Gemini call failed", {
      category: diagnostic.category,
      detail: diagnostic.detail,
      ...(diagnostic.code ? { code: diagnostic.code } : {}),
      ...(diagnostic.hint ? { hint: diagnostic.hint } : {}),
      model,
      promptVersion: PROMPT_VERSION,
    });
    return {
      text: deterministicAnswer(input.context),
      source: "deterministic",
      diagnostic,
      model,
      promptVersion: PROMPT_VERSION,
    };
  }
}
