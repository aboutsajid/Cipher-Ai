import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

type GateStatus = "passed" | "failed" | "skipped";

const CANONICAL_GATES = [
  "plan",
  "implement",
  "verify",
  "repair",
  "package",
  "installer-smoke",
  "approve"
] as const;

type GateId = typeof CANONICAL_GATES[number];
type RunMode = "build-product" | "standard";

const GENERATE_SCRIPT_PATH = resolve(process.cwd(), "scripts/generate-dod-telemetry-artifact.mjs");
const VERIFY_SCRIPT_PATH = resolve(process.cwd(), "scripts/verify-dod-telemetry-contract.mjs");

function createScenario(
  runMode: RunMode,
  statuses: Record<GateId, GateStatus>,
  options: { packagingCalled?: boolean; installerSmokeCalled?: boolean } = {}
) {
  return {
    taskId: `task-${runMode}`,
    runMode,
    status: "completed",
    summary: "ok",
    packagingCalled: options.packagingCalled ?? (runMode === "build-product"),
    installerSmokeCalled: options.installerSmokeCalled ?? (runMode === "build-product"),
    dodGateOutcomes: CANONICAL_GATES.map((gate) => ({
      gate,
      status: statuses[gate],
      summary: `${gate} ${statuses[gate]}`,
      updatedAt: "2026-05-02T11:00:00.000Z"
    }))
  };
}

function createValidArtifact() {
  return {
    version: 1,
    generatedAt: "2026-05-02T11:00:00.000Z",
    source: "test",
    scenarios: [
      createScenario("build-product", {
        plan: "passed",
        implement: "passed",
        verify: "passed",
        repair: "passed",
        package: "passed",
        "installer-smoke": "passed",
        approve: "passed"
      }),
      createScenario("standard", {
        plan: "passed",
        implement: "passed",
        verify: "passed",
        repair: "passed",
        package: "skipped",
        "installer-smoke": "skipped",
        approve: "passed"
      }, {
        packagingCalled: false,
        installerSmokeCalled: false
      })
    ]
  };
}

type DoDArtifact = ReturnType<typeof createValidArtifact>;

function createFakeRunnerModuleSource(): string {
  return [
    "\"use strict\";",
    "",
    "const CANONICAL_GATES = [",
    "  \"plan\",",
    "  \"implement\",",
    "  \"verify\",",
    "  \"repair\",",
    "  \"package\",",
    "  \"installer-smoke\",",
    "  \"approve\"",
    "];",
    "",
    "function createStatusMap(runMode) {",
    "  if (runMode === \"standard\") {",
    "    return {",
    "      plan: \"passed\",",
    "      implement: \"passed\",",
    "      verify: \"passed\",",
    "      repair: \"passed\",",
    "      package: \"skipped\",",
    "      \"installer-smoke\": \"skipped\",",
    "      approve: \"passed\"",
    "    };",
    "  }",
    "  return {",
    "    plan: \"passed\",",
    "    implement: \"passed\",",
    "    verify: \"passed\",",
    "    repair: \"passed\",",
    "    package: \"passed\",",
    "    \"installer-smoke\": \"passed\",",
    "    approve: \"passed\"",
    "  };",
    "}",
    "",
    "function buildGateOutcomes(runMode, fault) {",
    "  const statuses = createStatusMap(runMode);",
    "  let outcomes = CANONICAL_GATES.map((gate) => ({",
    "    gate,",
    "    status: statuses[gate],",
    "    summary: `${gate} ${statuses[gate]}`,",
    "    updatedAt: \"2026-05-02T11:00:00.000Z\"",
    "  }));",
    "",
    "  if (fault === \"non-canonical-order\" && runMode === \"build-product\") {",
    "    outcomes = [outcomes[1], outcomes[0], ...outcomes.slice(2)];",
    "  }",
    "  if (fault === \"missing-approve\" && runMode === \"build-product\") {",
    "    outcomes = outcomes.filter((entry) => entry.gate !== \"approve\");",
    "  }",
    "  if (fault === \"standard-product-gate-passed\" && runMode === \"standard\") {",
    "    outcomes = outcomes.map((entry) => {",
    "      if (entry.gate === \"package\" || entry.gate === \"installer-smoke\") {",
    "        return { ...entry, status: \"passed\", summary: `${entry.gate} passed` };",
    "      }",
    "      return entry;",
    "    });",
    "  }",
    "  if (fault === \"duplicate-gate\" && runMode === \"build-product\") {",
    "    outcomes = [...outcomes, { ...outcomes[2] }];",
    "  }",
    "  if (fault === \"unknown-gate\" && runMode === \"build-product\") {",
    "    outcomes = [...outcomes, {",
    "      gate: \"deploy\",",
    "      status: \"passed\",",
    "      summary: \"deploy passed\",",
    "      updatedAt: \"2026-05-02T11:00:00.000Z\"",
    "    }];",
    "  }",
    "  if (fault === \"build-product-verify-failed\" && runMode === \"build-product\") {",
    "    outcomes = outcomes.map((entry) => entry.gate === \"verify\"",
    "      ? { ...entry, status: \"failed\", summary: \"verify failed\" }",
    "      : entry);",
    "  }",
    "  return outcomes;",
    "}",
    "",
    "class AgentTaskRunner {",
    "  constructor() {",
    "    this.tasks = new Map();",
    "  }",
    "",
    "  async runTask(taskId) {",
    "    const task = this.tasks.get(taskId);",
    "    if (!task) throw new Error(`Unknown task ${taskId}`);",
    "",
    "    const runMode = task.runMode === \"standard\" ? \"standard\" : \"build-product\";",
    "    const fault = (process.env.CIPHER_DOD_GENERATOR_FAULT || \"\").trim();",
    "    const forceStandardProductGates = fault === \"standard-product-gate-passed\" && runMode === \"standard\";",
    "",
    "    if ((runMode === \"build-product\" || forceStandardProductGates) && typeof this.verifyWindowsDesktopPackaging === \"function\") {",
    "      if (fault !== \"build-product-packaging-skipped\") {",
    "        await this.verifyWindowsDesktopPackaging(task, {});",
    "      }",
    "    }",
    "    if ((runMode === \"build-product\" || forceStandardProductGates) && typeof this.verifyWindowsInstallerSmoke === \"function\") {",
    "      if (fault !== \"build-product-packaging-skipped\") {",
    "        await this.verifyWindowsInstallerSmoke(task, {});",
    "      }",
    "    }",
    "",
    "    task.status = fault === \"task-status-failed\" && runMode === \"build-product\" ? \"failed\" : \"completed\";",
    "    task.summary = \"ok\";",
    "    task.telemetry = {",
    "      ...(task.telemetry || {}),",
    "      runMode,",
    "      fallbackUsed: false,",
    "      modelAttempts: [],",
    "      dodGateOutcomes: buildGateOutcomes(runMode, fault)",
    "    };",
    "  }",
    "}",
    "",
    "module.exports = { AgentTaskRunner };",
    ""
  ].join("\n");
}

function writeFakeRunnerModule(tempDir: string): void {
  const servicesDir = join(tempDir, "dist", "main", "services");
  mkdirSync(servicesDir, { recursive: true });
  writeFileSync(join(servicesDir, "package.json"), JSON.stringify({ type: "commonjs" }, null, 2), "utf8");
  writeFileSync(join(servicesDir, "agentTaskRunner.js"), createFakeRunnerModuleSource(), "utf8");
}

function runGeneratorWithFakeRunner(
  fault?:
    | "non-canonical-order"
    | "missing-approve"
    | "standard-product-gate-passed"
    | "duplicate-gate"
    | "unknown-gate"
    | "build-product-verify-failed"
    | "build-product-packaging-skipped"
    | "task-status-failed"
): { status: number | null; output: string; artifact: DoDArtifact | null } {
  const tempDir = mkdtempSync(join(tmpdir(), "cipher-dod-generate-contract-"));
  const outputPath = join(tempDir, "tmp", "artifact.json");

  try {
    writeFakeRunnerModule(tempDir);
    const result = spawnSync(process.execPath, [
      GENERATE_SCRIPT_PATH,
      "--output",
      outputPath
    ], {
      cwd: tempDir,
      encoding: "utf8",
      env: {
        ...process.env,
        CIPHER_DOD_GENERATOR_FAULT: fault ?? ""
      }
    });

    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    const artifact = existsSync(outputPath)
      ? JSON.parse(readFileSync(outputPath, "utf8")) as DoDArtifact
      : null;

    return {
      status: result.status,
      output,
      artifact
    };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function runVerifierWithArtifact(artifact: unknown): { status: number | null; output: string; summary: string } {
  const tempDir = mkdtempSync(join(tmpdir(), "cipher-dod-contract-"));
  const artifactPath = join(tempDir, "artifact.json");
  const summaryPath = join(tempDir, "summary.md");

  try {
    writeFileSync(artifactPath, JSON.stringify(artifact, null, 2), "utf8");
    const result = spawnSync(process.execPath, [
      VERIFY_SCRIPT_PATH,
      artifactPath,
      "--output",
      summaryPath
    ], {
      cwd: process.cwd(),
      encoding: "utf8"
    });

    const summary = readFileSync(summaryPath, "utf8");
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    return { status: result.status, output, summary };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

test("DoD telemetry artifact generator emits canonical build-product and standard scenarios", () => {
  const result = runGeneratorWithFakeRunner();
  assert.equal(result.status, 0, result.output);
  assert.ok(result.artifact, "Expected a generated telemetry artifact.");

  const buildProduct = result.artifact?.scenarios.find((entry) => entry.runMode === "build-product");
  const standard = result.artifact?.scenarios.find((entry) => entry.runMode === "standard");
  assert.ok(buildProduct, "Expected a build-product scenario in generated artifact.");
  assert.ok(standard, "Expected a standard scenario in generated artifact.");

  assert.equal(buildProduct?.packagingCalled, true);
  assert.equal(buildProduct?.installerSmokeCalled, true);
  assert.deepEqual(
    buildProduct?.dodGateOutcomes.map((entry) => `${entry.gate}:${entry.status}`),
    [
      "plan:passed",
      "implement:passed",
      "verify:passed",
      "repair:passed",
      "package:passed",
      "installer-smoke:passed",
      "approve:passed"
    ]
  );

  assert.equal(standard?.packagingCalled, false);
  assert.equal(standard?.installerSmokeCalled, false);
  assert.deepEqual(
    standard?.dodGateOutcomes.map((entry) => `${entry.gate}:${entry.status}`),
    [
      "plan:passed",
      "implement:passed",
      "verify:passed",
      "repair:passed",
      "package:skipped",
      "installer-smoke:skipped",
      "approve:passed"
    ]
  );
});

test("DoD telemetry artifact generator fails when gate order is non-canonical", () => {
  const result = runGeneratorWithFakeRunner("non-canonical-order");

  assert.notEqual(result.status, 0, result.output);
  assert.equal(result.artifact, null, "Malformed generator output must not be written.");
  assert.match(result.output, /generated dod telemetry artifact is malformed/i);
  assert.match(result.output, /gate order is not canonical/i);
});

test("DoD telemetry artifact generator fails when a required gate is missing", () => {
  const result = runGeneratorWithFakeRunner("missing-approve");

  assert.notEqual(result.status, 0, result.output);
  assert.equal(result.artifact, null, "Malformed generator output must not be written.");
  assert.match(result.output, /generated dod telemetry artifact is malformed/i);
  assert.match(result.output, /missing gate "approve"/i);
});

test("DoD telemetry artifact generator fails when standard mode reports product-only gates as passed", () => {
  const result = runGeneratorWithFakeRunner("standard-product-gate-passed");

  assert.notEqual(result.status, 0, result.output);
  assert.equal(result.artifact, null, "Malformed generator output must not be written.");
  assert.match(result.output, /generated dod telemetry artifact is malformed/i);
  assert.match(result.output, /expected gate "package" status "skipped"/i);
  assert.match(result.output, /expected packaging executor to be skipped/i);
});

test("DoD telemetry artifact generator fails when build-product verification gate does not pass", () => {
  const result = runGeneratorWithFakeRunner("build-product-verify-failed");

  assert.notEqual(result.status, 0, result.output);
  assert.equal(result.artifact, null, "Malformed generator output must not be written.");
  assert.match(result.output, /generated dod telemetry artifact is malformed/i);
  assert.match(result.output, /expected gate "verify" status "passed"/i);
});

test("DoD telemetry artifact generator fails when build-product packaging executors are skipped", () => {
  const result = runGeneratorWithFakeRunner("build-product-packaging-skipped");

  assert.notEqual(result.status, 0, result.output);
  assert.equal(result.artifact, null, "Malformed generator output must not be written.");
  assert.match(result.output, /generated dod telemetry artifact is malformed/i);
  assert.match(result.output, /expected packaging executor to run/i);
  assert.match(result.output, /expected installer-smoke executor to run/i);
});

test("DoD telemetry artifact generator fails when build-product task status is not completed", () => {
  const result = runGeneratorWithFakeRunner("task-status-failed");

  assert.notEqual(result.status, 0, result.output);
  assert.equal(result.artifact, null, "Malformed generator output must not be written.");
  assert.match(result.output, /generated dod telemetry artifact is malformed/i);
  assert.match(result.output, /expected task status "completed" but found "failed"/i);
});

test("DoD telemetry artifact generator fails when a build-product gate is duplicated", () => {
  const result = runGeneratorWithFakeRunner("duplicate-gate");

  assert.notEqual(result.status, 0, result.output);
  assert.equal(result.artifact, null, "Malformed generator output must not be written.");
  assert.match(result.output, /generated dod telemetry artifact is malformed/i);
  assert.match(result.output, /duplicate gate entry "verify"/i);
});

test("DoD telemetry artifact generator fails when a build-product gate is unknown", () => {
  const result = runGeneratorWithFakeRunner("unknown-gate");

  assert.notEqual(result.status, 0, result.output);
  assert.equal(result.artifact, null, "Malformed generator output must not be written.");
  assert.match(result.output, /generated dod telemetry artifact is malformed/i);
  assert.match(result.output, /unknown gate "deploy"/i);
});

test("DoD telemetry contract verifier fails when gate order is non-canonical", () => {
  const artifact = createValidArtifact();
  const buildProduct = artifact.scenarios[0];
  if (!buildProduct) throw new Error("Build-product scenario is required for this test.");
  buildProduct.dodGateOutcomes = [
    buildProduct.dodGateOutcomes[1],
    buildProduct.dodGateOutcomes[0],
    ...buildProduct.dodGateOutcomes.slice(2)
  ];

  const result = runVerifierWithArtifact(artifact);
  assert.notEqual(result.status, 0, result.output);
  assert.match(result.output, /gate order is not canonical/i);
  assert.match(result.summary, /Status: failed/i);
});

test("DoD telemetry contract verifier fails when a required gate is missing", () => {
  const artifact = createValidArtifact();
  const buildProduct = artifact.scenarios[0];
  if (!buildProduct) throw new Error("Build-product scenario is required for this test.");
  buildProduct.dodGateOutcomes = buildProduct.dodGateOutcomes.filter((entry) => entry.gate !== "approve");

  const result = runVerifierWithArtifact(artifact);
  assert.notEqual(result.status, 0, result.output);
  assert.match(result.output, /missing gate "approve"/i);
  assert.match(result.summary, /Status: failed/i);
});

test("DoD telemetry contract verifier fails when standard mode reports product-only gates as passed", () => {
  const artifact = createValidArtifact();
  const standard = artifact.scenarios[1];
  if (!standard) throw new Error("Standard scenario is required for this test.");
  standard.packagingCalled = true;
  standard.installerSmokeCalled = true;
  standard.dodGateOutcomes = standard.dodGateOutcomes.map((entry) => {
    if (entry.gate === "package" || entry.gate === "installer-smoke") {
      return { ...entry, status: "passed" as const, summary: `${entry.gate} passed` };
    }
    return entry;
  });

  const result = runVerifierWithArtifact(artifact);
  assert.notEqual(result.status, 0, result.output);
  assert.match(result.output, /expected gate "package" status "skipped"/i);
  assert.match(result.output, /expected packaging executor to be skipped/i);
  assert.match(result.summary, /Status: failed/i);
});
