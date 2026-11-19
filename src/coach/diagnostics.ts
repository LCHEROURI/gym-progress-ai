import type { AppCheckStatus } from "../data/app-check";

/**
 * Safe, structured diagnostics for Gemini call failures in the coach chat.
 *
 * Hard rules:
 * - The raw error payload (provider messages, API keys, project ids, user
 *   data) never leaves this module. Classification reads the error message
 *   privately; the returned detail strings are fixed, app-owned copy.
 * - Callers log only `{ category, detail }` (see src/coach/chat.ts).
 */
export type CoachDiagnosticCategory =
  | "app-check"
  | "auth"
  | "quota"
  | "model"
  | "api-unavailable"
  | "network"
  | "unknown";

export interface CoachDiagnostic {
  category: CoachDiagnosticCategory;
  detail: string;
}

const DETAILS: Record<CoachDiagnosticCategory, string> = {
  "app-check":
    "The request was refused because App Check is not active on this device. The AI provider only accepts requests with a valid App Check token.",
  auth: "The request was refused because it was not authorized. Sign in again and retry.",
  quota: "The AI quota for this period is used up. Try again later.",
  model: "The AI model is not available in this project or region.",
  "api-unavailable": "The AI service is temporarily unavailable. Try again shortly.",
  network: "No connection to the AI service. Check your network and try again.",
  unknown: "The AI service refused the request.",
};

/** Private: best-effort message extraction for classification only. */
function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "";
}

/**
 * Map a caught Gemini failure to a category + safe copy. `appCheck` is the
 * live status from src/data/app-check.ts: when the provider refuses a request
 * and App Check was never activated (or failed to start), App Check is the
 * honest first suspect — it is the gate between the browser and the billable
 * Gemini endpoint.
 */
export function classifyCoachError(
  error: unknown,
  appCheck: AppCheckStatus,
): CoachDiagnostic {
  const message = errorMessage(error).slice(0, 300).toLowerCase();

  if (/app\s?check|appcheck|app_check/.test(message)) {
    return { category: "app-check", detail: DETAILS["app-check"] };
  }
  if (/quota|rate.?limit|resource.?exhausted|too many requests|429/.test(message)) {
    return { category: "quota", detail: DETAILS.quota };
  }
  if (/permission.?denied|forbidden|unauthorized|unauthenticated|401|403|credential|sign.?in/.test(message)) {
    if (appCheck !== "active") {
      return { category: "app-check", detail: DETAILS["app-check"] };
    }
    return { category: "auth", detail: DETAILS.auth };
  }
  if (/not found|404|unprovisioned|not enabled|unsupported model|unknown model|no model/.test(message)) {
    return { category: "model", detail: DETAILS.model };
  }
  if (/503|502|500|unavailable|backend|endpoint|internal/.test(message)) {
    return { category: "api-unavailable", detail: DETAILS["api-unavailable"] };
  }
  if (/network|fetch|offline|timeout|abort|enotfound|econnreset/.test(message)) {
    return { category: "network", detail: DETAILS.network };
  }
  return { category: "unknown", detail: DETAILS.unknown };
}
