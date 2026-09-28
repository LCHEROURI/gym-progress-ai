/**
 * Cloud Functions runtime limits are a real correctness constraint, not tuning.
 *
 * `reportBootFailure` shipped at 128MiB and the runtime OOM-killed it on every
 * cold start, before the handler ran — so a monitoring endpoint was returning
 * 500 to the first request after idle while looking healthy to a burst of
 * requests against a warm instance. Nothing in the test suite could have caught
 * that, because the failure lives in the deployed container, not in the code.
 *
 * What this suite can do is make the *number* a deliberate, reviewed value: if
 * someone lowers a memory limit again, the gate fails and the reason is in the
 * failure message.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync("functions/src/index.ts", "utf8");

/**
 * Floor, not a target. Module load alone measures ~81 MiB RSS; the deployed
 * 128MiB instance died at 141 MiB. 256MiB matches the scheduled functions and
 * leaves room for runtime overhead plus a Firestore gRPC client.
 */
const MIN_MEMORY_MIB = 256;

interface ExportedFunction {
  name: string;
  memoryMiB: number;
  timeoutSeconds: number;
}

function parseFunctions(): ExportedFunction[] {
  const out: ExportedFunction[] = [];
  // Each export is `export const <name> = on<Kind>({ ...opts }, handler)`.
  const re = /export const (\w+) = on(?:Request|Schedule|Call)\(\s*\{([\s\S]*?)\}/g;
  for (const [, name, opts] of source.matchAll(re)) {
    const mem = opts.match(/memory:\s*"(\d+)MiB"/);
    const timeout = opts.match(/timeoutSeconds:\s*(\d+)/);
    out.push({
      name,
      memoryMiB: mem ? Number(mem[1]) : NaN,
      timeoutSeconds: timeout ? Number(timeout[1]) : NaN,
    });
  }
  return out;
}

const fns = parseFunctions();

describe("Cloud Functions memory limits", () => {
  it("finds every exported function", () => {
    // A parser that silently matches nothing would make every assertion below
    // vacuously true, which is the exact failure mode this file exists to
    // prevent. Pin the count against what the source actually exports.
    const exported = [...source.matchAll(/export const (\w+) = on/g)].map((m) => m[1]);
    expect(exported.length).toBeGreaterThanOrEqual(3);
    expect(fns.map((f) => f.name).sort()).toEqual(exported.sort());
  });

  it("declares an explicit memory limit on every function", () => {
    const missing = fns.filter((f) => Number.isNaN(f.memoryMiB)).map((f) => f.name);
    expect(missing).toEqual([]);
  });

  it("gives every function enough memory to survive a cold start", () => {
    const tooSmall = fns
      .filter((f) => f.memoryMiB < MIN_MEMORY_MIB)
      .map((f) => `${f.name}=${f.memoryMiB}MiB`);
    expect(tooSmall).toEqual([]);
  });

  it("keeps the boot-report endpoint at the size its cold start needs", () => {
    // Called out separately because this one already shipped broken: the
    // runtime killed it at 141 MiB against a 128 MiB cap, before the handler
    // ran, so the 202-on-write-failure path never got a chance.
    const boot = fns.find((f) => f.name === "reportBootFailure");
    expect(boot).toBeDefined();
    expect(boot!.memoryMiB).toBeGreaterThanOrEqual(256);
  });
});

/**
 * Timeouts are a correctness constraint for the same reason memory is, and the
 * failure mode is quieter. `sundayWeeklyReports` ran at 540s — the *gen1*
 * maximum, on a gen2 function that allows 3600 — while doing ~122 sequential
 * round trips plus a Gemini call per user. When it expired, the run was only
 * partially complete: the per-user try/catch that stops one bad user from
 * killing the run also swallows the cut, so the users past the deadline were
 * silently skipped for a week and nothing logged an error.
 */
describe("Cloud Functions timeouts", () => {
  const byName = (name: string) => fns.find((f) => f.name === name);

  it("declares an explicit timeout on every function", () => {
    const missing = fns.filter((f) => Number.isNaN(f.timeoutSeconds)).map((f) => f.name);
    expect(missing).toEqual([]);
  });

  it("keeps every timeout within the gen2 ceiling", () => {
    // gen2 allows 3600s. A value above that is a deploy-time rejection, and
    // one at exactly the gen1 ceiling suggests a limit copied from gen1 docs.
    const tooLong = fns
      .filter((f) => f.timeoutSeconds > 3600)
      .map((f) => `${f.name}=${f.timeoutSeconds}s`);
    expect(tooLong).toEqual([]);
  });

  it("gives the weekly report run more than the gen1 maximum", () => {
    // 540 was the gen1 cap. The per-user work is linear and sequential, so the
    // old value budgeted ~4.4s per user before Gemini's 5-15s call counted.
    expect(byName("sundayWeeklyReports")!.timeoutSeconds).toBeGreaterThan(540);
  });

  it("leaves the boot endpoint's 20s budget alone", () => {
    // The liveness probe posts here every 15 minutes from three regions against
    // a function that scales to zero, so most probes are cold starts. A longer
    // timeout would only hide a slow cold start; the fix for that is a cheaper
    // module, pinned in the suite below.
    expect(byName("reportBootFailure")!.timeoutSeconds).toBe(20);
  });
});

/**
 * All three exports live in one module, and Cloud Functions loads the whole
 * module to serve any of them. A top-level `import { GoogleGenAI }` therefore
 * made reportBootFailure — which never calls Gemini — pay to load the Gemini
 * SDK inside a 20-second budget, on every cold start. That eager import is the
 * main reason module load measured ~81 MiB RSS, which is what the 128MiB OOM
 * died on. Raising the memory cap fixed the symptom; deferring the import
 * lowers the floor, which is what the next person needs pinned.
 */
describe("cold-start import cost", () => {
  it("does not import the Gemini SDK at module load", () => {
    // `await import(` inside the function is the fix; a top-level import is
    // the bug. Assert on the absence of the top-level form specifically.
    expect(source).not.toMatch(/^import .*@google\/genai/m);
    expect(source).toMatch(/await import\("@google\/genai"\)/);
  });

  it("keeps the Gemini key check ahead of the import, so no key means no load", () => {
    // If the import moved above the early return, every cold start would load
    // the SDK even with no key configured — reintroducing the cost this
    // deferred specifically to avoid.
    const keyGuard = source.indexOf("if (!apiKey) return null;");
    const dynamicImport = source.indexOf('await import("@google/genai")');
    expect(keyGuard).toBeGreaterThan(-1);
    expect(dynamicImport).toBeGreaterThan(keyGuard);
  });

  it("pages the users collection instead of reading it whole", () => {
    // `collection("users").get()` materializes every user document in one
    // batch. Both scheduled functions scan it, so the exposure grows with the
    // user base and stays invisible until it is not.
    expect(source).not.toMatch(/collection\("users"\)\.get\(\)/);
    expect(source).toMatch(/orderBy\(FieldPath\.documentId\(\)\)/);
  });

  it("routes BOTH scheduled functions through the pager", () => {
    // Two of these. Fixing the weekly scan and leaving the 5-minute reminder
    // scan unbounded would leave the more frequent job — the one with the 60s
    // budget — as the one that dies first, which is the opposite of the
    // priority order.
    const paged = [...source.matchAll(/for await \(const uid of eachUserId\(db\)\)/g)];
    expect(paged.length).toBe(2);
  });
});
