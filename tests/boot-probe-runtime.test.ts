// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BOOT_GLOBAL, BOOT_MOUNT_TIMEOUT_MS, bootProbeScript } from "../src/shared/boot-probe";
import { bootFailureReport } from "../src/shared/boot-failure";
import { CHUNK_RELOAD_KEY } from "../src/shared/chunk-recovery";

/**
 * These tests execute the real probe source in a DOM, because the string
 * assertions in boot-probe.test.ts cannot catch a logic bug. The bug this file
 * was written for: a healthy boot that mounted must NOT report "no mount
 * signal" when the timer fires.
 */
type ProbeWindow = Window & {
  [BOOT_GLOBAL]?: { markMounted: () => void; reportRenderFailure: (m: string) => void };
};

function installProbe(): { fetchMock: ReturnType<typeof vi.fn> } {
  document.head.innerHTML = '<meta name="app-build-id" content="TESTBUILD123" />';
  const fetchMock = vi.fn(() => Promise.resolve({ ok: true }));
  vi.stubGlobal("fetch", fetchMock);
  window.sessionStorage.clear();

  // The probe self-heals a failed entry chunk by reloading. jsdom's
  // location.reload is non-configurable and cannot be stubbed, so the reload
  // attempt is observed through the sessionStorage marker it writes first.
  // eslint-disable-next-line no-new-func -- executing the shipped source is the point
  new Function(bootProbeScript).call(window);
  return { fetchMock };
}

function reportPayloads(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.map((call) =>
    bootFailureReport.parse(JSON.parse(String((call[1] as { body: string }).body))),
  );
}

describe("boot probe runtime behavior", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.head.innerHTML = "";
    delete (window as unknown as Record<string, unknown>)[BOOT_GLOBAL];
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("reports a boot failure when the app never mounts", () => {
    const { fetchMock } = installProbe();
    expect(fetchMock).not.toHaveBeenCalled();

    vi.advanceTimersByTime(BOOT_MOUNT_TIMEOUT_MS + 1);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe("/__boot");
    const [report] = reportPayloads(fetchMock);
    expect(report.stage).toBe("boot");
    expect(report.buildId).toBe("TESTBUILD123");
    expect(report.message).toContain("No mount signal");
    expect(report.elapsedMs).toBeGreaterThanOrEqual(BOOT_MOUNT_TIMEOUT_MS);
  });

  it("stays silent on a healthy boot — the regression this probe must not have", () => {
    const { fetchMock } = installProbe();
    (window as ProbeWindow)[BOOT_GLOBAL]!.markMounted();

    vi.advanceTimersByTime(BOOT_MOUNT_TIMEOUT_MS * 3);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stays silent even when the mount lands just before the deadline", () => {
    const { fetchMock } = installProbe();
    vi.advanceTimersByTime(BOOT_MOUNT_TIMEOUT_MS - 1);
    (window as ProbeWindow)[BOOT_GLOBAL]!.markMounted();
    vi.advanceTimersByTime(5_000);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a render crash from the app's handle", () => {
    const { fetchMock } = installProbe();
    (window as ProbeWindow)[BOOT_GLOBAL]!.markMounted();
    (window as ProbeWindow)[BOOT_GLOBAL]!.reportRenderFailure(
      'Failed to fetch dynamically imported module: "/assets/index-old.js"',
    );

    const [report] = reportPayloads(fetchMock);
    expect(report.stage).toBe("render");
    expect(report.message).toContain("dynamically imported module");
  });

  it("reports a pre-mount window error", () => {
    const { fetchMock } = installProbe();
    window.dispatchEvent(
      new ErrorEvent("error", { message: "Uncaught SyntaxError: Unexpected token '<'" }),
    );

    const [report] = reportPayloads(fetchMock);
    expect(report.stage).toBe("window-error");
    expect(report.message).toContain("Unexpected token");
  });

  it("reports a script that failed to load, naming the asset", () => {
    const { fetchMock } = installProbe();
    const script = document.createElement("script");
    script.setAttribute("src", "/assets/index-deadbeef.js");
    // Must be in the document: a resource error does not bubble, and the probe
    // only receives it via the capture phase.
    document.body.appendChild(script);
    script.dispatchEvent(new Event("error"));

    const [report] = reportPayloads(fetchMock);
    expect(report.stage).toBe("boot");
    expect(report.message).toContain("/assets/index-deadbeef.js");
    script.remove();
  });

  it("reports an unhandled rejection", () => {
    const { fetchMock } = installProbe();
    const event = new Event("unhandledrejection") as Event & { reason?: unknown };
    Object.defineProperty(event, "reason", { value: new Error("chunk 404") });
    window.dispatchEvent(event);

    const [report] = reportPayloads(fetchMock);
    expect(report.stage).toBe("window-error");
    expect(report.message).toContain("chunk 404");
  });

  it("sends at most one report per page load", () => {
    const { fetchMock } = installProbe();
    (window as ProbeWindow)[BOOT_GLOBAL]!.reportRenderFailure("first");
    (window as ProbeWindow)[BOOT_GLOBAL]!.reportRenderFailure("second");
    window.dispatchEvent(new ErrorEvent("error", { message: "third" }));
    vi.advanceTimersByTime(BOOT_MOUNT_TIMEOUT_MS + 1);

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("keeps a hostile message inside the schema limit", () => {
    const { fetchMock } = installProbe();
    (window as ProbeWindow)[BOOT_GLOBAL]!.reportRenderFailure("x".repeat(5_000));

    const [report] = reportPayloads(fetchMock);
    expect(report.message.length).toBeLessThanOrEqual(300);
  });

  it("does not install twice if injected twice", () => {
    const { fetchMock } = installProbe();
    // eslint-disable-next-line no-new-func -- re-running the shipped source
    new Function(bootProbeScript).call(window);
    (window as ProbeWindow)[BOOT_GLOBAL]!.reportRenderFailure("only once");

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("spends the session reload when the entry script fails to load", () => {
    const { fetchMock } = installProbe();
    const script = document.createElement("script");
    script.setAttribute("src", "/assets/index-deadbeef.js");
    document.body.appendChild(script);
    script.dispatchEvent(new Event("error"));

    // The entry chunk never loaded, so nothing in the app can recover: the
    // probe writes the marker (immediately before reloading) itself. Same key
    // the error boundary uses, so the two paths cannot both reload.
    expect(window.sessionStorage.getItem(CHUNK_RELOAD_KEY)).toContain(
      "/assets/index-deadbeef.js",
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    script.remove();
  });

  it("does not reload again when a stale shell fails a second time", () => {
    // The realistic loop: the device reloaded, the network served the same
    // cached shell, and the same chunk failed again. The marker written by the
    // previous document must stop a second reload — proof being that a reload
    // would have overwritten it.
    const { fetchMock } = installProbe();
    const seeded = JSON.stringify({ reason: "previous attempt", at: 1 });
    window.sessionStorage.setItem(CHUNK_RELOAD_KEY, seeded);

    const script = document.createElement("script");
    script.setAttribute("src", "/assets/index-deadbeef.js");
    document.body.appendChild(script);
    script.dispatchEvent(new Event("error"));

    expect(window.sessionStorage.getItem(CHUNK_RELOAD_KEY)).toBe(seeded);
    expect(fetchMock).toHaveBeenCalledOnce();
    script.remove();
  });

  it("does not mark a reload for an ordinary pre-mount error", () => {
    const { fetchMock } = installProbe();
    window.dispatchEvent(new ErrorEvent("error", { message: "something odd happened" }));

    expect(window.sessionStorage.getItem(CHUNK_RELOAD_KEY)).toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("survives a transport failure without throwing", () => {
    document.head.innerHTML = '<meta name="app-build-id" content="TESTBUILD123" />';
    const fetchMock = vi.fn(() => {
      throw new Error("offline");
    });
    vi.stubGlobal("fetch", fetchMock);
    // eslint-disable-next-line no-new-func -- executing the shipped source
    new Function(bootProbeScript).call(window);

    expect(() => {
      (window as ProbeWindow)[BOOT_GLOBAL]!.reportRenderFailure("boom");
    }).not.toThrow();
  });
});
