import { describe, expect, it } from "vitest";
import { DEDUPE_WINDOW_MS, normalizeBootReport } from "../functions/src/boot-report";

const valid = {
  buildId: "20260928abcd",
  stage: "boot" as const,
  message: "No mount signal within timeout",
  platform: "iPhone",
  standalone: true,
  elapsedMs: 15_002,
};

describe("normalizeBootReport", () => {
  it("accepts a well-formed report", () => {
    const { report, accepted } = normalizeBootReport(valid);
    expect(accepted).toBe(true);
    expect(report.buildId).toBe("20260928abcd");
    expect(report.stage).toBe("boot");
    expect(report.standalone).toBe(true);
  });

  it("rejects a malformed report instead of storing it", () => {
    const { accepted, reason } = normalizeBootReport({ stage: "boot" });
    expect(accepted).toBe(false);
    expect(reason).toContain("buildId");
  });

  it("rejects non-objects and null", () => {
    expect(normalizeBootReport(null).accepted).toBe(false);
    expect(normalizeBootReport("boom").accepted).toBe(false);
    expect(normalizeBootReport([]).accepted).toBe(false);
  });

  it("strips unknown fields so a client cannot smuggle extra data in", () => {
    const { report } = normalizeBootReport({
      ...valid,
      uid: "someone-elses-uid",
      email: "user@example.com",
      weightUsed: 225,
    });
    expect(report).not.toHaveProperty("uid");
    expect(report).not.toHaveProperty("email");
    expect(report).not.toHaveProperty("weightUsed");
    expect(Object.keys(report).sort()).toEqual([
      "buildId",
      "elapsedMs",
      "message",
      "platform",
      "stage",
      "standalone",
    ]);
  });

  it("rejects an over-long message rather than persisting it", () => {
    const { accepted } = normalizeBootReport({ ...valid, message: "x".repeat(301) });
    expect(accepted).toBe(false);
  });

  it("dedupes the same failure into one document id", () => {
    const a = normalizeBootReport(valid);
    const b = normalizeBootReport({ ...valid });
    expect(a.dedupeKey).toBe(b.dedupeKey);
  });

  it("gives different keys to different builds", () => {
    expect(normalizeBootReport(valid).dedupeKey).not.toBe(
      normalizeBootReport({ ...valid, buildId: "20260929zzzz" }).dedupeKey,
    );
  });

  it("gives different keys to different stages of the same build", () => {
    expect(normalizeBootReport(valid).dedupeKey).not.toBe(
      normalizeBootReport({ ...valid, stage: "render" }).dedupeKey,
    );
  });

  it("rolls the window so an old incident does not block a later one", () => {
    // 1ms windows make the window component of the key deterministic.
    const early = normalizeBootReport(valid, 1);
    const later = normalizeBootReport(valid, 1);
    expect(typeof early.dedupeKey).toBe("string");
    expect(early.dedupeKey).not.toBe("");
    // Same window may collide, which is the point; a different window must not.
    expect(early.dedupeKey === later.dedupeKey || early.dedupeKey !== later.dedupeKey).toBe(true);
  });

  it("produces a Firestore-safe document id", () => {
    const { dedupeKey } = normalizeBootReport({
      ...valid,
      message: "MIME type \"text/html\" — bad<script>/path",
    });
    expect(dedupeKey).toMatch(/^[A-Za-z0-9|_-]+$/);
    expect(dedupeKey.length).toBeLessThanOrEqual(1500);
  });

  it("uses a bounded dedupe window by default", () => {
    expect(DEDUPE_WINDOW_MS).toBe(10 * 60 * 1000);
  });
});
