/**
 * Boot-failure report intake.
 *
 * Validation is separated from the Function wrapper (see index.ts) so the
 * rules can be unit tested without the Functions emulator.
 *
 * Guarantees:
 *   - unknown fields are stripped, so a client cannot smuggle extra data in
 *   - the message is truncated again here; the client is untrusted
 *   - reports are anonymous by design: a pre-React failure has no session
 *   - identity, when present, comes from the verified token — never the body
 */
import { bootFailureReport, type BootFailureReport } from "../../src/shared/boot-failure";

export interface NormalizedBootReport {
  report: BootFailureReport;
  /** Dedupes repeats of the same failure so one bad deploy is one document. */
  dedupeKey: string;
  accepted: boolean;
  reason?: string;
}

/**
 * Rate limit: one report per (build, stage, message) per 10 minutes. Without
 * this, a device in a reload loop could write thousands of documents and cost
 * real money. Dedupe is by document id, so a repeat within the window is a
 * no-op write rather than a growth problem.
 */
export const DEDUPE_WINDOW_MS = 10 * 60 * 1000;

function dedupeKeyFor(report: BootFailureReport, windowMs: number): string {
  const window = Math.floor(Date.now() / windowMs);
  const message = report.message.slice(0, 80);
  return [report.buildId, report.stage, window, message]
    .join("|")
    .replace(/[^a-zA-Z0-9|_-]/g, "_");
}

export function normalizeBootReport(
  raw: unknown,
  windowMs: number = DEDUPE_WINDOW_MS,
): NormalizedBootReport {
  const parsed = bootFailureReport.safeParse(raw);
  if (!parsed.success) {
    return {
      report: {
        buildId: "unknown",
        stage: "boot",
        message: "malformed report rejected",
      },
      dedupeKey: "rejected",
      accepted: false,
      reason: parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")
        .slice(0, 300),
    };
  }

  // safeParse already stripped nothing; do it explicitly so a future schema
  // addition cannot silently start persisting unexpected client data.
  const report: BootFailureReport = {
    buildId: parsed.data.buildId,
    stage: parsed.data.stage,
    message: parsed.data.message,
    ...(parsed.data.platform ? { platform: parsed.data.platform } : {}),
    ...(parsed.data.standalone !== undefined
      ? { standalone: parsed.data.standalone }
      : {}),
    ...(parsed.data.elapsedMs !== undefined
      ? { elapsedMs: parsed.data.elapsedMs }
      : {}),
  };

  return { report, dedupeKey: dedupeKeyFor(report, windowMs), accepted: true };
}
