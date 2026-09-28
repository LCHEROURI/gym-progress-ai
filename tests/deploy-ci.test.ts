import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The deploy workflow had no caller for its entire life, which is exactly how
 * it stayed invisible: nothing failed, nothing deployed, and README claimed CI
 * deployed. These assertions exist so the same drift is caught by the gate
 * rather than by the next incident.
 *
 * Two failure modes are pinned here, both silent:
 *   - a trigger the reusable workflow does not recognise, so it matches neither
 *     its `preview` nor its `production` job and the run reports success having
 *     deployed nothing
 *   - a deploy that stops being gated on a green build
 *
 * Deliberately not a YAML parser. `js-yaml` is in the lockfile only as a
 * transitive dependency and ships no types, so importing it means either an
 * `any` (AGENTS.md forbids one without a written reason) or adding a dependency
 * for one test file. Every assertion below is about the presence, absence, and
 * ordering of specific keys, which raw text answers exactly — and a test that
 * cannot parse the file is still useful, because a workflow that will not
 * upload fails at GitHub long before it fails here.
 */

const CALLER_PATH = ".github/workflows/deploy-hosting.yml";
const REUSABLE_PATH = ".github/workflows/firebase-hosting-reusable.yml";
const REUSABLE_REF = "./.github/workflows/firebase-hosting-reusable.yml";

const caller = readFileSync(CALLER_PATH, "utf8");
const reusable = readFileSync(REUSABLE_PATH, "utf8");

/** Trimmed lines starting with `prefix`, e.g. "needs:" or "run:". */
function lines(source: string, prefix: string): string[] {
  return source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith(prefix));
}

/** Keys declared directly under a top-level block, e.g. the jobs in `jobs:`. */
function topLevelKeys(source: string, block: string): string[] {
  return blockSlice(source, block)
    .split("\n")
    .map((line) => line.match(/^ {2}([A-Za-z0-9_-]+):/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => m[1]);
}

/**
 * The text of one top-level block, from its key to the next line that dedents
 * out of it. Without the bound, a scan of `on:` runs on through every job and
 * reports the job names as triggers.
 */
function blockSlice(source: string, block: string): string {
  const start = source.indexOf(`\n${block}:\n`);
  if (start === -1) return "";
  const rest = source.slice(start + block.length + 3);
  // `^` in a multiline regex matches right after a newline, so a continuation
  // line like " # still visible" looks like a dedent unless the leading space
  // is excluded explicitly.
  const end = rest.search(/^[^\s#]/m);
  return end === -1 ? rest : rest.slice(0, end);
}

describe("deploy-hosting workflow", () => {
  it("declares the four jobs the pipeline depends on", () => {
    // If the file were malformed or the jobs renamed, every assertion below
    // would be matching against nothing. Pin the shape first.
    expect(topLevelKeys(caller, "jobs").sort()).toEqual([
      "deploy",
      "preflight",
      "smoke",
      "verify",
    ]);
  });

  it("actually calls the reusable workflow", () => {
    // The bug this file exists for: the reusable workflow had zero callers.
    expect(caller).toContain(`uses: ${REUSABLE_REF}`);
  });

  it("triggers on push to main and pull requests, nothing else", () => {
    // The reusable workflow branches on `github.event_name`. An event it does
    // not recognise selects neither job, so the run succeeds having deployed
    // nothing — a silent no-op, which is worse than a loud failure.
    const onBlock = blockSlice(caller, "on");
    const triggers = [...onBlock.matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1]);
    expect(triggers.sort()).toEqual(["pull_request", "push"]);
    expect(onBlock).toMatch(/push:\n {4}branches: \[main\]/);
  });

  it("has no workflow_dispatch, which would deploy nothing and report success", () => {
    expect(caller).not.toMatch(/^\s*workflow_dispatch:/m);
  });

  it("gates the deploy on a green check, not a bare build", () => {
    expect(lines(caller, "needs:").join(" ")).toContain("verify");
    // `npm run build` alone would publish a merge whose tests fail. The
    // blank-screen incident was a bad deploy shipping; this is the cheap guard.
    expect(caller).toContain("npm run check");
  });

  it("grants id-token: write to the deploy job", () => {
    // A called workflow cannot widen permissions beyond its caller, so this is
    // what makes the OIDC exchange work at all. Its absence fails at runtime,
    // deep inside the auth step, as an opaque 401.
    expect(caller).toMatch(/id-token: write/);
  });

  it("passes infrastructure as variables, never literals", () => {
    expect(caller).toContain("vars.FIREBASE_PROJECT");
    expect(caller).toContain("vars.FIREBASE_DEPLOYER_SERVICE_ACCOUNT");
    // Not `GITHUB_WIF_PROVIDER`: GitHub reserves the GITHUB_ prefix for its own
    // context variables and rejects the name with HTTP 422 on `gh variable
    // set`. Found by trying it, not by reading the docs.
    expect(caller).toContain("vars.WORKLOAD_IDENTITY_PROVIDER");
    expect(caller).not.toContain("vars.GITHUB_");
    // A hard-coded project id would deploy to the wrong place the first time
    // this repo were recreated.
    expect(caller).not.toContain("gym-progress-ai-lcherouri");
  });

  it("fails with an actionable message when configuration is missing", () => {
    // Search the whole file, not the `run:` lines: the script body of a
    // `run: |` step lives on the lines *after* the key.
    expect(caller).toContain("FIREBASE_DEPLOYER_SERVICE_ACCOUNT");
    // The alternative is failing deep inside the OIDC step with a 401 that
    // reads like a permissions bug rather than a missing repository variable.
    expect(caller).toMatch(/::error::Missing repository variables/);
  });

  it("does not cancel in-flight deploys of the same ref", () => {
    // Cancelling a deploy that already started uploading can leave the site
    // with a partial asset set — a self-inflicted version of the deploy race
    // in docs/BLANK-SCREEN-RUNBOOK.md.
    expect(caller).toMatch(/cancel-in-progress: false/);
  });

  it("scopes the build to hosting, not functions", () => {
    expect(caller).toContain("build-command: npm run build");
    // Functions, rules, and indexes stay manual: a rules deploy is a security
    // change and should not happen unattended on every merge.
    expect(caller).not.toMatch(/--only functions/);
    expect(caller).not.toMatch(/firestore:rules/);
  });

  it("smoke-checks the routing that caused the blank screen", () => {
    // A deleted chunk must 404, not 200 text/html — the difference between an
    // honest failure and a cached HTML shell that bricks an iPhone until site
    // data is cleared by hand.
    expect(caller).toContain("does-not-exist.js");
    expect(caller).toContain("404");
    // And the boot intake must answer, because an empty bootFailures collection
    // is ambiguous: no failures, a broken intake, or a broken deploy all look
    // the same from the console. This is the check that would have caught the
    // cold-start OOM in PR #6.
    expect(caller).toContain("__boot");
    expect(caller).toContain("202");
  });

  it("runs the smoke check after the deploy, not in parallel", () => {
    const needs = caller.slice(caller.indexOf("\n  smoke:"));
    expect(needs).toMatch(/needs:\s*\[deploy\]/);
  });
});

describe("reusable workflow contract", () => {
  it("selects its job by event name, which is why triggers are pinned above", () => {
    // Both conditions are event-name equality checks, so any other event —
    // workflow_dispatch, schedule, repository_dispatch — matches neither job.
    expect(reusable).toContain("if: github.event_name == 'pull_request'");
    expect(reusable).toContain("if: github.event_name == 'push'");
  });

  it("still has no second caller in this repository", () => {
    // A second caller would reintroduce the two-deploys-at-once hazard that the
    // concurrency group exists to prevent.
    const others = readdirSync(".github/workflows")
      .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
      .filter((f) => f !== "deploy-hosting.yml")
      .filter((f) =>
        readFileSync(`.github/workflows/${f}`, "utf8").includes(REUSABLE_REF),
      );
    expect(others).toEqual([]);
  });
});
