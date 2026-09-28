/**
 * Boot-failure reporting payload.
 *
 * Lives in src/shared/ because both sides validate it: the browser probe
 * builds a `BootFailureReport`, and the Cloud Function parses the exact same
 * shape before writing anything. One schema, two consumers, no drift.
 *
 * Privacy: this reports *how the app failed to start*, never what the user did.
 * No uid, email, workout, weight, or any health-style data. AGENTS.md forbids
 * sensitive notes in analytics events; this is the same rule applied to a
 * crash report. The uid is never trusted from the client anyway — the Function
 * reads identity from the verified token, and reports stay allowed anonymously
 * because a pre-React boot failure has no authenticated session to send.
 */
import { z } from "zod";

/** Where the app died. `boot` means React never mounted at all. */
export const bootFailureStage = z.enum([
  "boot", // pre-React: the module never started
  "window-error", // a window.onerror / unhandledrejection reached the probe
  "render", // AppErrorBoundary caught a render or lazy-load crash
]);

export type BootFailureStage = z.infer<typeof bootFailureStage>;

/**
 * Keep every field short and enumerated. An untrusted client posts this, so a
 * field that can grow without bound is a field that can be used to smuggle data
 * into the operator's log.
 */
export const bootFailureReport = z.object({
  /** Correlates with the build ID in the app header; see vite.config.ts. */
  buildId: z.string().max(40),
  stage: bootFailureStage,
  /** Error text, already truncated by the reporter. */
  message: z.string().max(300),
  /** Coarse platform facts. No user agent string: it is a fingerprint. */
  platform: z.string().max(40).optional(),
  standalone: z.boolean().optional(),
  /** Milliseconds from page start to failure, to spot slow-network boots. */
  elapsedMs: z.number().int().min(0).max(600_000).optional(),
});

export type BootFailureReport = z.infer<typeof bootFailureReport>;

/** Endpoint path, served by the Hosting rewrite in firebase.json. */
export const BOOT_REPORT_PATH = "/__boot";

/** Cap the message on the client too, not just the server. */
export const MAX_BOOT_MESSAGE = 300;

export function truncateBootMessage(raw: unknown): string {
  const text = typeof raw === "string" ? raw : String(raw ?? "");
  return text.length > MAX_BOOT_MESSAGE
    ? `${text.slice(0, MAX_BOOT_MESSAGE - 1)}…`
    : text;
}

// Deliberately no DOM helpers here: this module is imported by the Cloud
// Function, whose tsconfig has no "dom" lib. Browser-only helpers such as
// isStandalone() live in src/shared/boot-monitor.ts, which never runs in Node.
