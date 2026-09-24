import type { FirebaseApp } from "firebase/app";
import { GoogleAIBackend, getAI, getGenerativeModel } from "firebase/ai";
import { COACH_SYSTEM, coachPrompt } from "../ai/prompts/coach-chat";
import { DEFAULT_MODEL } from "./explain";
import type { CoachContext } from "./context";

export const INSUFFICIENT_HISTORY = "I don't have enough workout history yet.";

export interface CoachMessage {
  role: "user" | "model";
  text: string;
}

export function deterministicAnswer(context: CoachContext): string {
  return context.summaryLines.join(" ") || INSUFFICIENT_HISTORY;
}

/**
 * Pipeline steps 4-6: send only the computed facts to Gemini, ask for the
 * interpretation, return it. No facts → the exact insufficient-history line,
 * without calling the model at all.
 */
export async function askCoach(input: {
  app: FirebaseApp;
  question: string;
  context: CoachContext;
  history?: CoachMessage[];
  model?: string;
}): Promise<string> {
  if (input.context.insufficient) return INSUFFICIENT_HISTORY;
  const model = input.model ?? DEFAULT_MODEL;
  try {
    const genAI = getAI(input.app, { backend: new GoogleAIBackend() });
    const gm = getGenerativeModel(genAI, { model, systemInstruction: COACH_SYSTEM });
    const chat = gm.startChat({
      history: (input.history ?? []).map((m) => ({
        role: m.role,
        parts: [{ text: m.text }],
      })),
    });
    const res = await chat.sendMessage(coachPrompt(input.context.facts, input.question));
    const text = res.response.text().trim();
    return text ? text.slice(0, 2000) : deterministicAnswer(input.context);
  } catch {
    return deterministicAnswer(input.context);
  }
}
