import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bootProbeScript } from "../src/shared/boot-probe";
import { BOOT_REPORT_PATH } from "../src/shared/boot-failure";

const html = readFileSync("index.html", "utf8");
const firebaseJson = JSON.parse(readFileSync("firebase.json", "utf8"));

describe("pre-React boot probe wiring", () => {
  it("ships a placeholder for the build id and the probe", () => {
    // The placeholders are what bootProbePlugin() in vite.config.ts replaces.
    expect(html).toContain("%APP_BUILD_ID_META%");
    expect(html).toContain("%BOOT_PROBE%");
  });

  it("places the probe above the entry module", () => {
    // Ordering is the entire mechanism: a probe injected after the module tag
    // cannot observe the module failing to run.
    expect(html.indexOf("%BOOT_PROBE%")).toBeGreaterThan(-1);
    expect(html.indexOf("%BOOT_PROBE%")).toBeLessThan(html.indexOf("/src/main.tsx"));
  });

  it("routes the report path to the Function before the SPA rewrite", () => {
    const rewrites = firebaseJson.hosting.rewrites as {
      source: string;
      destination?: string;
      function?: unknown;
    }[];
    const bootIndex = rewrites.findIndex((r) => r.source === BOOT_REPORT_PATH);
    // Looked up by destination, not by the literal "**": the SPA rewrite
    // deliberately is not a bare catch-all any more.
    const spaIndex = rewrites.findIndex((r) => r.destination === "/index.html");
    expect(bootIndex).toBeGreaterThanOrEqual(0);
    expect(spaIndex).toBeGreaterThan(bootIndex);
    expect(rewrites[bootIndex].function).toBeTruthy();
    expect(rewrites[bootIndex].destination).toBeUndefined();
  });

  it("marks the report endpoint no-store", () => {
    const headers = firebaseJson.hosting.headers as {
      source: string;
      headers: { key: string; value: string }[];
    }[];
    const boot = headers.find((h) => h.source === BOOT_REPORT_PATH);
    expect(boot).toBeTruthy();
    expect(boot!.headers.map((h) => h.key)).toContain("Cache-Control");
    expect(boot!.headers.find((h) => h.key === "Cache-Control")!.value).toBe("no-store");
  });

  it("registers the Function export the rewrite points at", () => {
    const functions = readFileSync("functions/src/index.ts", "utf8");
    expect(functions).toContain("export const reportBootFailure");
  });

  it("injects a script that is safe to inline in HTML", () => {
    // A literal "</script>" inside the injected text would close the tag early
    // and break the page — the classic inline-script bug.
    expect(bootProbeScript).not.toContain("</script");
    expect(bootProbeScript).not.toContain("<!--");
  });
});
