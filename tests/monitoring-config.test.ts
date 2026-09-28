import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The /__boot liveness monitor is configuration that lives outside the
 * repository, in Cloud Monitoring. Nothing about it is exercised by
 * `npm run check`, and it fails silently in the worst way a monitor can: a
 * filter that matches no time series never fires, and a probe document that is
 * never purged quietly fills the collection the monitor is meant to make
 * readable.
 *
 * These assertions pin the parts that can drift from what is actually
 * deployed, and the cross-file invariant that ties the probe to the purge.
 *
 * Deliberately text-based, like tests/deploy-ci.test.ts: `js-yaml` is only a
 * transitive dependency and ships no types, and every assertion here is about
 * a specific key's presence and value rather than about parsing.
 */

const CHECK_CONFIG = "monitoring/boot-intake-liveness.yaml";
const POLICY = "monitoring/boot-intake-alert-policy.yaml";
const PROVISION = "monitoring/provision.sh";
const PURGE_WORKFLOW = ".github/workflows/purge-liveness-probes.yml";
const PURGE_SCRIPT = "functions/purge-boot-failures.mjs";

const check = readFileSync(CHECK_CONFIG, "utf8");
const policy = readFileSync(POLICY, "utf8");
const provision = readFileSync(PROVISION, "utf8");
const purgeWorkflow = readFileSync(PURGE_WORKFLOW, "utf8");
const purgeScript = readFileSync(PURGE_SCRIPT, "utf8");

/** The buildId the probe writes, extracted from the request body. */
function probeBuildId(): string {
  const m = check.match(/buildId\\?":\\?"([a-z-]+)/);
  return m?.[1] ?? "";
}

describe("liveness monitor configuration", () => {
  it("exists at all — the monitor is not in the repo, so nothing else can find it", () => {
    for (const path of [CHECK_CONFIG, POLICY, PROVISION, PURGE_WORKFLOW]) {
      expect(existsSync(path)).toBe(true);
    }
  });

  it("posts to /__boot and accepts only 202", () => {
    expect(check).toContain("path: /__boot");
    // Exactly 202, not a 2xx class: a bare 200 from a proxy or a contract
    // change would pass a class check. (Note 202 is itself a 2xx, so this has
    // to be an exact match, not a "not 2xx" assertion.)
    const codes = check.match(/statusValue:\s*(\S+)/g) ?? [];
    expect(codes).toEqual(["statusValue: 202"]);
    expect(check).not.toMatch(/statusClass|STATUS_CLASS/);
  });

  it("asserts the response body, so a bare 202 from a proxy cannot pass it", () => {
    expect(check).toContain("contentMatchers");
    expect(check).toContain('"ok":true');
  });

  it("targets the uptime_url monitored resource", () => {
    // gcloud spells this --resource-type=uptime-url; the stored config is
    // uptime_url. A wrong target here produces a check that silently never
    // runs, which looks identical to a healthy one in the console.
    expect(check).toMatch(/type:\s*uptime_url/);
    expect(check).toContain("host: gym-progress-ai-lcherouri.web.app");
  });

  it("keeps TLS validation on", () => {
    // Off would make the probe attest to the TLS terminator instead of the
    // endpoint — a MITM could report a dead function healthy.
    expect(check).toMatch(/validateSslCertificates:\s*true/);
    expect(provision).toMatch(/--validate-ssl=true/);
  });

  it("runs from at least three regions", () => {
    const regions = check.match(/- (usa-[a-z]+)/g) ?? [];
    expect(regions.length).toBeGreaterThanOrEqual(3);
  });
});

describe("liveness alert policy", () => {
  it("filters on this specific check, not merely the host", () => {
    // A host-only filter would also fire on a future, unrelated check against
    // the same domain, and would be silently broadened by any later addition.
    expect(policy).toContain("uptime_check/check_passed");
    expect(policy).toMatch(/metric\.labels\.check_id = "boot-intake-liveness-/);
  });

  it("requires sustained failure rather than a single probe", () => {
    // One failing probe out of three regions is usually a network blip.
    expect(policy).toMatch(/duration:\s*600s/);
  });

  it("uses the newline-joined filter string the v3 API requires", () => {
    // A YAML list fails with "Proto field is not repeating". This comment is
    // load-bearing: the obvious-looking form does not work.
    expect(policy).toContain("filter: |-");
    expect(policy).toContain("Proto field is not repeating");
  });

  it("notifies on a real channel", () => {
    expect(policy).toMatch(/notificationChannels:\s*\n\s*- projects\/.+\/notificationChannels\/\d+/);
  });

  it("documents that a continuously-failing check notifies only once", () => {
    // No repeat interval exists in this API. Saying so is better than letting
    // someone assume they will keep getting emails.
    expect(policy).toMatch(/notifies exactly once|no repeat interval/i);
  });
});

describe("probe documents are purged", () => {
  it("purges on a schedule, off the top of the hour", () => {
    expect(purgeWorkflow).toContain("schedule:");
    expect(purgeWorkflow).toMatch(/cron: "\d+ \d+ \* \* \*"/);
    // GitHub drops scheduled runs under load and clusters them at :00.
    expect(purgeWorkflow).not.toMatch(/cron: "0 \d+ \* \* \*"/);
  });

  it("deletes exactly the buildId the probe writes", () => {
    // THE invariant. If these drift, the purge silently matches nothing and
    // the collection grows forever with no error anywhere.
    const probeId = probeBuildId();
    expect(probeId).toBe("liveness-probe");
    expect(purgeWorkflow).toContain(
      `node purge-boot-failures.mjs ${probeId} --confirm`,
    );
  });

  it("never uses a prefix or substring match for a bulk delete", () => {
    // AGENTS.md rule 7. The buildId argument must be the exact string: a
    // prefix such as "liveness" or a wildcard would eventually reach a real
    // build's reports.
    // Anchored to the start of a line: a prose mention of the script in a
    // comment would otherwise be matched instead of the invocation.
    const arg = purgeWorkflow.match(/^\s*node purge-boot-failures\.mjs\s+(\S+)/m)?.[1];
    expect(arg).toBe("liveness-probe");
    expect(arg).not.toMatch(/[*%]/);
    expect(purgeWorkflow).not.toMatch(/--confirm.*--force/);
  });

  it("keeps the purge script fail-closed", () => {
    expect(purgeScript).toContain("MAX_DELETE");
    expect(purgeScript).toContain("--confirm");
  });
});
