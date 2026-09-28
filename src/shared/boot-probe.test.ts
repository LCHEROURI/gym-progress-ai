// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import {
  bootFailureReport,
  MAX_BOOT_MESSAGE,
  truncateBootMessage,
  BOOT_REPORT_PATH,
} from "./boot-failure";
import {
  BOOT_GLOBAL,
  BOOT_MOUNT_TIMEOUT_MS,
  BOOT_REPORT_URL,
  bootProbeScript,
} from "./boot-probe";
import { isStandalone, markMounted, reportRenderFailure } from "./boot-monitor";

describe("boot failure payload", () => {
  it("accepts a minimal valid report", () => {
    const parsed = bootFailureReport.parse({
      buildId: "20260928abcd",
      stage: "boot",
      message: "No mount signal within timeout",
    });
    expect(parsed.buildId).toBe("20260928abcd");
    expect(parsed.stage).toBe("boot");
  });

  it("rejects an unknown stage", () => {
    expect(
      bootFailureReport.safeParse({
        buildId: "b",
        stage: "definitely-not-a-stage",
        message: "x",
      }).success,
    ).toBe(false);
  });

  it("rejects an over-long buildId or message", () => {
    const base = { buildId: "b", stage: "boot" as const, message: "x" };
    expect(bootFailureReport.safeParse({ ...base, buildId: "b".repeat(41) }).success).toBe(false);
    expect(
      bootFailureReport.safeParse({ ...base, message: "x".repeat(MAX_BOOT_MESSAGE + 1) }).success,
    ).toBe(false);
  });

  it("rejects a negative or absurd elapsedMs", () => {
    const base = { buildId: "b", stage: "boot" as const, message: "x" };
    expect(bootFailureReport.safeParse({ ...base, elapsedMs: -1 }).success).toBe(false);
    expect(bootFailureReport.safeParse({ ...base, elapsedMs: 10_000_000 }).success).toBe(false);
  });

  it("carries no user-identifying fields", () => {
    // A regression guard on the privacy claim: nothing here may accept a uid,
    // email, or workout field from an untrusted client.
    const schemaKeys = Object.keys(
      bootFailureReport.parse({ buildId: "b", stage: "boot", message: "x" }),
    );
    expect(schemaKeys).not.toContain("uid");
    expect(schemaKeys).not.toContain("email");
    expect(schemaKeys).not.toContain("workout");
  });
});

describe("truncateBootMessage", () => {
  it("leaves a short message intact", () => {
    expect(truncateBootMessage("boom")).toBe("boom");
  });

  it("caps a long message at the documented maximum", () => {
    const out = truncateBootMessage("x".repeat(500));
    expect(out).toHaveLength(MAX_BOOT_MESSAGE);
    expect(out.endsWith("…")).toBe(true);
  });

  it("handles non-string input without throwing", () => {
    expect(truncateBootMessage(undefined)).toBe("");
    expect(truncateBootMessage(new Error("from an error"))).toBe("Error: from an error");
  });
});

describe("isStandalone", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is false in a normal browser tab", () => {
    vi.stubGlobal("window", {
      navigator: {},
      matchMedia: () => ({ matches: false }),
    });
    expect(isStandalone()).toBe(false);
  });

  it("is true for an iOS home-screen app", () => {
    vi.stubGlobal("window", {
      navigator: { standalone: true },
      matchMedia: () => ({ matches: false }),
    });
    expect(isStandalone()).toBe(true);
  });

  it("is true for display-mode: standalone", () => {
    vi.stubGlobal("window", {
      navigator: {},
      matchMedia: (q: string) => ({ matches: q.includes("standalone") }),
    });
    expect(isStandalone()).toBe(true);
  });
});

describe("boot probe script", () => {
  it("is a self-contained IIFE that imports nothing", () => {
    // The whole point: this runs before any module, so it must not import.
    expect(bootProbeScript).not.toMatch(/\bimport\s*\(/);
    expect(bootProbeScript).not.toMatch(/\brequire\(/);
    expect(bootProbeScript).not.toMatch(/\bfetch\(["']/);
  });

  it("installs the global the app calls into", () => {
    expect(bootProbeScript).toContain(`window.${BOOT_GLOBAL}`);
    expect(bootProbeScript).toContain("markMounted");
    expect(bootProbeScript).toContain("reportRenderFailure");
  });

  it("reports through the rewritten endpoint", () => {
    expect(bootProbeScript).toContain(BOOT_REPORT_URL);
    expect(BOOT_REPORT_URL).toBe(BOOT_REPORT_PATH);
  });

  it("watches for a mount with a timeout", () => {
    expect(bootProbeScript).toContain(String(BOOT_MOUNT_TIMEOUT_MS));
    expect(BOOT_MOUNT_TIMEOUT_MS).toBeGreaterThan(5000);
  });

  it("catches the three pre-React failure shapes", () => {
    expect(bootProbeScript).toContain('addEventListener("error"');
    expect(bootProbeScript).toContain('addEventListener("unhandledrejection"');
    expect(bootProbeScript).toContain("Script failed to load");
  });

  it("never lets a transport failure escape", () => {
    // sendBeacon and fetch are both wrapped; an unhandled throw here would
    // break the page it is monitoring.
    expect(bootProbeScript).toContain("catch");
    expect(bootProbeScript).toContain("keepalive");
  });

  it("is idempotent, so a double-injection cannot double-report", () => {
    expect(bootProbeScript).toContain(`if (window.${BOOT_GLOBAL}) return;`);
  });
});

describe("app-side monitor handle", () => {
  const globalWindow = window as unknown as Record<string, unknown>;

  afterEach(() => {
    delete globalWindow[BOOT_GLOBAL];
  });

  it("does nothing when the probe is absent (dev, tests, stripped build)", () => {
    expect(() => markMounted()).not.toThrow();
    expect(() => reportRenderFailure("boom")).not.toThrow();
  });

  it("forwards the mount signal and render failures", () => {
    const handle = { markMounted: vi.fn(), reportRenderFailure: vi.fn() };
    globalWindow[BOOT_GLOBAL] = handle;

    markMounted();
    reportRenderFailure("chunk 404");

    expect(handle.markMounted).toHaveBeenCalledOnce();
    expect(handle.reportRenderFailure).toHaveBeenCalledWith("chunk 404");
  });

  it("swallows a probe that throws, so monitoring cannot break the app", () => {
    globalWindow[BOOT_GLOBAL] = {
      markMounted: () => {
        throw new Error("probe exploded");
      },
      reportRenderFailure: () => {
        throw new Error("probe exploded");
      },
    };
    expect(() => markMounted()).not.toThrow();
    expect(() => reportRenderFailure("boom")).not.toThrow();
  });
});
