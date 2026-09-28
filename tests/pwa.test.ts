import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("PWA installability assets", () => {
  const manifest = JSON.parse(
    readFileSync("public/manifest.webmanifest", "utf8"),
  ) as {
    name: string;
    display: string;
    start_url: string;
    icons: { src: string; sizes: string; purpose: string }[];
  };

  it("manifest declares installability basics", () => {
    expect(manifest.name).toBe("Gym Progress AI");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.some((i) => i.sizes === "512x512")).toBe(true);
    expect(manifest.icons.some((i) => i.purpose === "maskable")).toBe(true);
  });

  it("every manifest icon exists and is a real PNG", () => {
    const pngMagic = [137, 80, 78, 71, 13, 10, 26, 10];
    for (const icon of manifest.icons) {
      const path = `public/${icon.src}`;
      expect(existsSync(path), path).toBe(true);
      const head = readFileSync(path).subarray(0, 8);
      expect([...head], path).toEqual(pngMagic);
    }
  });

  it("service worker precaches the shell and never touches API traffic", () => {
    const sw = readFileSync("public/sw.js", "utf8");
    expect(sw).toContain("gym-progress-ai-v4");
    expect(sw).toContain("url.origin !== self.location.origin");
    expect(sw).toContain('caches.match("/index.html")');
    // regression: the cache name is spelled consistently
    expect(sw).not.toContain("CATCH");
  });

  it("service worker shows raw workout reminders without Firebase imports", () => {
    const sw = readFileSync("public/sw.js", "utf8");
    expect(sw).toContain('self.addEventListener("push"');
    expect(sw).toContain('self.addEventListener("notificationclick"');
    expect(sw).toContain('tag: "workout-reminder"');
    // raw push handling keeps config and keys out of committed files
    expect(sw).not.toContain("importScripts");
    expect(sw).not.toContain("firebase");
  });
});
