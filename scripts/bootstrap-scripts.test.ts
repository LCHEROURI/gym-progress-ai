import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");
const verifier = join(root, "scripts/verify-bootstrap.sh");
const creator = join(root, "scripts/create-repo-from-template.sh");
const firebaseConfigurator = join(root, "scripts/configure-firebase-app.sh");
const tempDirs: string[] = [];

function tempDir(prefix: string): string {
  const path = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(path);
  return path;
}

function runVerifier(cwd: string) {
  return spawnSync("bash", [verifier], {
    cwd,
    encoding: "utf8",
  });
}

function installValidBootstrap(cwd: string) {
  execFileSync("git", ["init", "-q"], { cwd });
  writeFileSync(
    join(cwd, "AGENTS.md"),
    "Repository lock\ngit rev-parse --show-toplevel\nSee WORKFLOW.md\n",
  );
  writeFileSync(join(cwd, "WORKFLOW.md"), "commit\npush\nmerge\n");
  const skillDir = join(cwd, "skills/progressive-distillation");
  execFileSync("mkdir", ["-p", skillDir]);
  writeFileSync(
    join(skillDir, "SKILL.md"),
    "Experience → Reflection → Principle → Experiment → Save\n",
  );
}

function installFakeGh(cwd: string, mode: "create" | "exists") {
  const bin = join(cwd, "bin");
  execFileSync("mkdir", ["-p", bin]);
  const log = join(cwd, "gh.log");
  const script = `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(args) + "\\n");
if (args[0] === "auth" && args[1] === "status") process.exit(0);
if (args[0] === "repo" && args[1] === "view") process.exit(${mode === "exists" ? "0" : "1"});
if (args[0] === "repo" && args[1] === "create") process.exit(0);
if (args[0] === "api") process.exit(0);
process.exit(1);
`;
  const fakeGh = join(bin, "gh");
  writeFileSync(fakeGh, script);
  chmodSync(fakeGh, 0o755);
  return { bin, log };
}

afterEach(() => {
  for (const path of tempDirs.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("verify-bootstrap.sh", () => {
  it("passes when the root contains the required files and markers", () => {
    const cwd = tempDir("bootstrap-valid-");
    installValidBootstrap(cwd);

    const result = runVerifier(cwd);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("PASS: universal bootstrap verified");
  });

  it("fails when AGENTS.md is missing the repository lock", () => {
    const cwd = tempDir("bootstrap-invalid-");
    installValidBootstrap(cwd);
    writeFileSync(join(cwd, "AGENTS.md"), "See WORKFLOW.md\n");

    const result = runVerifier(cwd);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("AGENTS.md is missing universal safety marker");
  });

  it("does not accept safety markers split misleadingly across policy files", () => {
    const cwd = tempDir("bootstrap-split-");
    installValidBootstrap(cwd);
    writeFileSync(join(cwd, "AGENTS.md"), "See WORKFLOW.md\n");
    writeFileSync(
      join(cwd, "WORKFLOW.md"),
      "Repository lock\ngit rev-parse --show-toplevel\ncommit\npush\nmerge\n",
    );

    const result = runVerifier(cwd);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("AGENTS.md is missing universal safety marker");
  });
});

describe("automatic Firebase setup", () => {
  it("exposes safe Firebase and OIDC setup controls", () => {
    const creatorSource = readFileSync(creator, "utf8");
    const configuratorSource = readFileSync(firebaseConfigurator, "utf8");

    expect(creatorSource).toContain("--firebase-project");
    expect(creatorSource).toContain("--no-firebase");
    expect(creatorSource).toContain("configure-firebase-app.sh");
    expect(configuratorSource).toContain("workload-identity-pools");
    expect(configuratorSource).toContain("roles/iam.workloadIdentityUser");
    expect(configuratorSource).toContain("apps.yml");
    expect(configuratorSource).not.toContain("FIREBASE_SERVICE_ACCOUNT");
  });

  it("derives a bounded deterministic Firebase project identifier", () => {
    const creatorSource = readFileSync(creator, "utf8");

    expect(creatorSource).toContain('digest="$(printf');
    expect(creatorSource).toContain('project_id="${slug:0:23}-$digest"');
  });
});

describe("create-repo-from-template.sh", () => {
  it("creates and verifies a private repository with parsed options", () => {
    const cwd = tempDir("bootstrap-create-");
    const fake = installFakeGh(cwd, "create");

    const result = spawnSync("bash", [
      creator,
      "new-app",
      "--private",
      "--owner",
      "LCHEROURI",
      "--description",
      "AI assisted app",
      "--no-firebase",
    ], {
      cwd,
      encoding: "utf8",
      env: { ...process.env, PATH: `${fake.bin}:${process.env.PATH}` },
    });

    const calls = readFileSync(fake.log, "utf8");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("PASS: LCHEROURI/new-app");
    expect(calls).toContain('"--template"');
    expect(calls).toContain('"--private"');
    expect(calls).toContain('"AI assisted app"');
  });

  it("rejects unsupported repository names before calling GitHub", () => {
    const cwd = tempDir("bootstrap-name-");
    const fake = installFakeGh(cwd, "create");

    const result = spawnSync("bash", [creator, "bad/name"], {
      cwd,
      encoding: "utf8",
      env: { ...process.env, PATH: `${fake.bin}:${process.env.PATH}` },
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("unsupported characters");
    expect(existsSync(fake.log)).toBe(false);
  });

  it("refuses to reuse an existing repository", () => {
    const cwd = tempDir("bootstrap-existing-");
    const fake = installFakeGh(cwd, "exists");

    const result = spawnSync("bash", [creator, "already-there"], {
      cwd,
      encoding: "utf8",
      env: { ...process.env, PATH: `${fake.bin}:${process.env.PATH}` },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("repository already exists");
    expect(readFileSync(fake.log, "utf8")).not.toContain('"create"');
  });
});
