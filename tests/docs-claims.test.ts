import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

/**
 * Documentation is load-bearing here: AGENTS.md is the constitution every agent
 * reads before touching code, so a claim that names a script or a path which
 * does not exist is worse than no claim. This suite fails when one drifts.
 *
 * Scope is deliberately narrow — npm script names and repo-relative paths named
 * in backticks. It does not try to judge prose.
 */

const DOCS = [
  "README.md",
  "AGENTS.md",
  "docs/ARCHITECTURE.md",
  "docs/DATA-MODEL.md",
  "docs/TEST-PLAN.md",
  "docs/PRINCIPLES.md",
] as const;

/**
 * Paths a doc is allowed to name while explicitly saying they do not exist.
 * Each entry keeps the sentence that licenses it honest; if a path stops being
 * discussed as absent, remove it here and fix the prose instead.
 */
const KNOWN_ABSENT = new Set([
  // ARCHITECTURE.md: "A single shared table (...) does not exist."
  "functions/src/ai/models.ts",
  // AGENTS.md: "There is no `src/shared/schemas/` directory".
  "src/shared/schemas/",
]);

/** A doc may name a module without its extension; resolve the usual ones. */
function pathExists(candidate: string): boolean {
  if (existsSync(candidate)) return true;
  if (/\.[a-z]+$/.test(candidate)) return false;
  return [".ts", ".tsx", "/index.ts", "/index.tsx"].some((ext) =>
    existsSync(candidate + ext),
  );
}

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts: Record<string, string>;
};
const scripts = new Set(Object.keys(pkg.scripts));

/** `src/...`, `docs/...`, `functions/src/...`, `public/...`, `scripts/...` */
const PATH_RE = /`((?:src|docs|functions|public|scripts|tests)\/[A-Za-z0-9._/-]+)`/g;
/** `npm run <script>` in prose or code fences. */
const SCRIPT_RE = /npm run ([a-z:_-]+)/g;

const offenders: string[] = [];

for (const doc of DOCS) {
  const text = readFileSync(doc, "utf8");
  for (const [, path] of text.matchAll(PATH_RE)) {
    const clean = path.replace(/[.,;:]$/, "");
    if (KNOWN_ABSENT.has(clean)) continue;
    if (!pathExists(clean)) offenders.push(`${doc}: path not found: ${clean}`);
  }
  for (const [, script] of text.matchAll(SCRIPT_RE)) {
    if (!scripts.has(script)) {
      offenders.push(`${doc}: npm script not in package.json: ${script}`);
    }
  }
}

describe("documentation claims", () => {
  it("names only npm scripts that exist", () => {
    expect(offenders.filter((o) => o.includes("npm script"))).toEqual([]);
  });

  it("names only repo paths that exist", () => {
    expect(offenders.filter((o) => o.includes("path not found"))).toEqual([]);
  });
});
