import type { AppCheckStatus } from "../data/app-check";

/**
 * Safe, structured diagnostics for Gemini call failures in the coach chat.
 *
 * Hard rules:
 * - The raw error payload (provider messages, API keys, project ids, user
 *   data) never leaves this module. Classification reads the error message
 *   privately; the returned detail strings are fixed, app-owned copy.
 * - `code` is the error's own structured code (FirebaseError-style) or name —
 *   surfaced so a refusal the patterns don't recognize can still be
 *   investigated. `hint` is a bounded, sanitized fragment of the message and
 *   is omitted entirely when any credential-like text is present.
 * - Callers log only safe fields (see src/coach/chat.ts).
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
  /** Structured error code from the thrown error; safe to surface. */
  code?: string;
  /** Bounded, sanitized error-message fragment; absent when not clean. */
  hint?: string;
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

/**
 * A hint is dropped entirely when the (stripped) message still contains any
 * of these: the words key/token, "AIza", a URL scheme, an email address, or
 * a domain-shaped fragment. Over-aggressive on purpose — losing a hint is
 * always acceptable, leaking a credential is not.
 */
const HINT_BAN =
  /key|token|aiza|https?:|www\.|\.[a-z]{2,}\b|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

/** Artifacts stripped from a message before it can become a hint. */
const HINT_STRIP_PATTERNS: RegExp[] = [
  /https?:\/\/[^\s"'<>]+/gi,
  /(^|\s)www\.[^\s"'<>]+/gi,
  /\b(?:api[_-]?key|secret|token|key)\s*[=:]\s*[\w-]+/gi,
  /\b(?:for\s+)?project[s]?\s+[\w.-]+/gi,
];

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

/** Private: the error's own structured code (FirebaseError) or name. */
function errorCode(error: unknown): string | undefined {
  if (error && typeof error === "object") {
    const candidate = (error as { code?: unknown; name?: unknown }).code;
    const fallback = (error as { name?: unknown }).name;
    for (const value of [candidate, fallback]) {
      if (typeof value === "string" && value.trim()) {
        const code = value.trim().slice(0, 64);
        if (!HINT_BAN.test(code)) return code;
      }
    }
  }
  return undefined;
}

/** Private: bounded, sanitized message fragment, or nothing when unclean. */
function safeHint(error: unknown): string | undefined {
  const message = errorMessage(error);
  if (!message) return undefined;
  const stripped = HINT_STRIP_PATTERNS.reduce(
    (text, pattern) => text.replace(pattern, " "),
    message,
  );
  if (HINT_BAN.test(stripped)) return undefined;
  const hint = stripped
    .replace(/\s+/g, " ")
    .replace(/\s+(?:at|for|in|by|from|to|on)\s*$/i, "")
    .replace(/[.,;:]+$/, "")
    .trim()
    .slice(0, 120);
  return hint.length > 0 ? hint : undefined;
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
  const message = errorMessage(error).slice(0, 1000).toLowerCase();
  const code = errorCode(error) ?? "unknown";
  const normalizedCode = code.toLowerCase();
  const hint = safeHint(error);

  const base: CoachDiagnostic = { category: "unknown", detail: DETAILS.unknown, code };
  if (hint) base.hint = hint;

  if (/app\s?check|appcheck|app_check/.test(message)) {
    return { ...base, category: "app-check", detail: DETAILS["app-check"] };
  }
  if (/quota|rate.?limit|resource.?exhausted|too many requests|429/.test(message)) {
    return { ...base, category: "quota", detail: DETAILS.quota };
  }
  if (/permission.?denied|forbidden|unauthorized|unauthenticated|401|403|credential|sign.?in/.test(message)) {
    if (appCheck !== "active") {
      return { ...base, category: "app-check", detail: DETAILS["app-check"] };
    }
    return { ...base, category: "auth", detail: DETAILS.auth };
  }
  if (
    /api-not-enabled|no-model/.test(normalizedCode) ||
    /not found|404|unprovisioned|not enabled|unsupported model|unknown model|no model/.test(
      message,
    )
  ) {
    return { ...base, category: "model", detail: DETAILS.model };
  }
  if (/503|502|500|unavailable|backend|endpoint|internal/.test(message)) {
    return { ...base, category: "api-unavailable", detail: DETAILS["api-unavailable"] };
  }
  if (/network|fetch|offline|timeout|abort|enotfound|econnreset/.test(message)) {
    return { ...base, category: "network", detail: DETAILS.network };
  }
  return base;
}
