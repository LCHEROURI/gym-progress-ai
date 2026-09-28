import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Guards the routing that makes a deleted chunk fail honestly.
 *
 * The bug: Hosting rewrites apply to any path without a matching file, so a
 * `/assets/*.js` removed by a deploy was answered with the SPA shell at HTTP
 * 200 text/html. The module import then failed on a MIME error and the worker
 * cached the HTML under the chunk's URL.
 *
 * The fix is a negated SPA rewrite. Which negation actually works is not
 * guesswork — it was measured against the Hosting emulator:
 *   "**"                -> missing asset 200 text/html   (the bug)
 *   "!/(assets)/**"     -> missing asset 200 text/html   (extglob form is IGNORED)
 *   "!@(assets)/**"     -> missing asset 200 text/html   (extglob form is IGNORED)
 *   "!/assets/**"       -> missing asset 404             <- the one that works
 *   "!/assets{,/**}"    -> missing asset 404
 *
 * The documented "excludes specified pathways from rewrites" example uses the
 * `@(js|css)` extglob form, which this deployment does not honour. These tests
 * exist so that regression is caught without re-running the emulator.
 */

const hosting = (
  JSON.parse(readFileSync("firebase.json", "utf8")) as {
    hosting: {
      public: string;
      rewrites: { source: string; destination?: string; function?: unknown }[];
      headers: { source: string; headers: { key: string; value: string }[] }[];
    };
  }
).hosting;

const spaRewrite = hosting.rewrites.find((r) => r.destination === "/index.html");

describe("hosting routing — deleted assets must not become the SPA shell", () => {
  it("has exactly one SPA rewrite", () => {
    expect(
      hosting.rewrites.filter((r) => r.destination === "/index.html"),
    ).toHaveLength(1);
    expect(spaRewrite).toBeDefined();
  });

  it("is not a bare catch-all, which is what caused the bug", () => {
    expect(spaRewrite!.source).not.toBe("**");
  });

  it("excludes /assets from the rewrite so a missing chunk 404s", () => {
    // Negated globs, not the @() extglob form: the emulator ignores that form,
    // and the bare path is the only negation measured to return 404.
    expect(spaRewrite!.source.startsWith("!")).toBe(true);
    expect(spaRewrite!.source).toContain("/assets/**");
    expect(spaRewrite!.source).not.toContain("@(");
    expect(spaRewrite!.source).not.toContain("{/");
  });

  it("still serves the app shell for client-side routes", () => {
    // A negation must not narrow the rewrite into uselessness: anything that
    // is not under /assets still falls through to index.html.
    const source = spaRewrite!.source;
    expect(source.startsWith("!")).toBe(true);
    expect(source).not.toMatch(/!\/?$/);
    expect(source.endsWith("/**")).toBe(true);
  });

  it("keeps the boot-report rewrite ahead of the SPA rewrite", () => {
    const bootIndex = hosting.rewrites.findIndex((r) => r.source === "/__boot");
    const spaIndex = hosting.rewrites.indexOf(spaRewrite!);
    expect(bootIndex).toBeGreaterThanOrEqual(0);
    expect(bootIndex).toBeLessThan(spaIndex);
  });

  it("keeps the shell itself uncached so a deploy reaches users", () => {
    const values = (source: string) =>
      hosting.headers
        .find((h) => h.source === source)
        ?.headers.map((h) => h.value) ?? [];
    expect(values("/")).toContain("no-cache");
    expect(values("**/*.html")).toContain("no-cache");
    expect(values("/sw.js")).toContain("no-cache");
    expect(values("/__boot")).toContain("no-store");
  });
});
