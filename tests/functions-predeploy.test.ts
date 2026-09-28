import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Guards the functions build hook.
 *
 * `functions/lib` is compiled output, not source, and it is what the Functions
 * runtime actually loads. A deploy ships whatever is sitting in that directory.
 * On 2026-09-28 a deploy shipped a four-hour-old build, silently omitting a
 * newly added function while still reporting success — the hosting rewrite
 * pointed at an endpoint that did not exist.
 *
 * The Firebase CLI does not run npm lifecycle scripts. It runs the command
 * strings in firebase.json -> functions.predeploy, which is why this belongs
 * here and not in functions/package.json.
 */

const firebaseJson = JSON.parse(readFileSync("firebase.json", "utf8")) as {
  functions: {
    source: string;
    runtime: string;
    predeploy?: string[];
  };
  hosting: { predeploy?: string[] };
};

const functionsConfig = firebaseJson.functions;

describe("functions predeploy build hook", () => {
  it("declares a predeploy step", () => {
    expect(Array.isArray(functionsConfig.predeploy)).toBe(true);
    expect(functionsConfig.predeploy!.length).toBeGreaterThan(0);
  });

  it("builds the TypeScript sources before packaging", () => {
    // Same string the CLI's own TypeScript init template writes, so the
    // $RESOURCE_DIR placeholder is expanded against the functions directory.
    expect(functionsConfig.predeploy).toContain('npm --prefix "$RESOURCE_DIR" run build');
  });

  it("targets a directory that actually has a build script", () => {
    const pkg = JSON.parse(readFileSync(`${functionsConfig.source}/package.json`, "utf8")) as {
      scripts?: Record<string, string>;
    };
    expect(pkg.scripts?.build).toBeTruthy();
  });

  it("points at the compiled output the runtime loads", () => {
    // If main ever stops pointing into lib/, this hook builds the wrong thing.
    const pkg = JSON.parse(readFileSync(`${functionsConfig.source}/package.json`, "utf8")) as {
      main: string;
    };
    expect(pkg.main).toContain("lib/");
  });
});

describe("hosting predeploy — the same staleness class, now closed", () => {
  it("builds the app before publishing dist/", () => {
    // dist/ is uploaded exactly as it sits on disk, so without this hook a
    // hosting deploy ships whatever was built last. Same lifecycleHooks
    // mechanism and the same fail-closed behaviour as the functions hook.
    expect(firebaseJson.hosting.predeploy).toContain("npm run build");
  });

  it("builds from the repository root, where the build script lives", () => {
    // The functions hook needs --prefix because it runs inside the resource
    // dir; hosting publishes the root dist/, so the plain command is correct.
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };
    expect(pkg.scripts?.build).toBeTruthy();
  });
});
