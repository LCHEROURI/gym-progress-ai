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
}

function parseFunctions(): ExportedFunction[] {
  const out: ExportedFunction[] = [];
  // Each export is `export const <name> = on<Kind>({ ...opts }, handler)`.
  const re = /export const (\w+) = on(?:Request|Schedule|Call)\(\s*\{([\s\S]*?)\}/g;
  for (const [, name, opts] of source.matchAll(re)) {
    const mem = opts.match(/memory:\s*"(\d+)MiB"/);
    out.push({ name, memoryMiB: mem ? Number(mem[1]) : NaN });
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
