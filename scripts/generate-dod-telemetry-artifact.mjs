import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const require = createRequire(import.meta.url);

function loadCompiledModule(relativePath) {
  const absolutePath = resolve(process.cwd(), relativePath);
  try {
    return require(absolutePath);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load ${relativePath}. Run "npm run build" first. ${detail}`);
  }
}

function printUsage() {
  console.log([
    "Usage: node scripts/generate-dod-telemetry-artifact.mjs [options]",
    "",
    "Options:",
    "  --output <path>    Output artifact path. Default: tmp/agent-dod-telemetry-contract.json",
    "  --help             Show this usage text."
  ].join("\n"));
}

function parseArgs(argv) {
  const options = {
    outputPath: resolve("tmp", "agent-dod-telemetry-contract.json"),
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--output") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --output.");
      }
      options.outputPath = resolve(value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

const CANONICAL_GATES = [
  "plan",
  "implement",
  "verify",
  "repair",
  "package",
  "installer-smoke",
  "approve"
];

function gateStatus(outcomes, gate) {
  const match = outcomes.find((entry) => entry?.gate === gate);
  return match ? match.status : null;
}

function validateCanonicalOrder(outcomes, scenarioLabel, errors) {
  const seen = new Set();
  let lastGateIndex = -1;

  for (const entry of outcomes) {
    const gateIndex = CANONICAL_GATES.indexOf(entry?.gate);
    if (gateIndex < 0) {
      errors.push(`${scenarioLabel}: unknown gate "${String(entry?.gate)}".`);
      continue;
    }
    if (seen.has(entry.gate)) {
      errors.push(`${scenarioLabel}: duplicate gate entry "${entry.gate}".`);
      continue;
    }
    seen.add(entry.gate);
    if (gateIndex < lastGateIndex) {
      errors.push(`${scenarioLabel}: gate order is not canonical at "${entry.gate}".`);
    }
    lastGateIndex = gateIndex;
  }

  for (const gate of CANONICAL_GATES) {
    if (!seen.has(gate)) {
      errors.push(`${scenarioLabel}: missing gate "${gate}".`);
    }
  }
}

function assertGateStatus(outcomes, scenarioLabel, gate, expectedStatus, errors) {
  const status = gateStatus(outcomes, gate);
  if (status !== expectedStatus) {
    errors.push(`${scenarioLabel}: expected gate "${gate}" status "${expectedStatus}" but found "${status ?? "missing"}".`);
  }
}

function validateScenarioContract(scenario, index, errors) {
  const runMode = scenario?.runMode ?? "unknown";
  const scenarioLabel = `${runMode} scenario #${index + 1}`;
  if (scenario?.status !== "completed") {
    errors.push(`${scenarioLabel}: expected task status "completed" but found "${scenario?.status ?? "missing"}".`);
  }

  const outcomes = Array.isArray(scenario?.dodGateOutcomes) ? scenario.dodGateOutcomes : null;
  if (!outcomes) {
    errors.push(`${scenarioLabel}: dodGateOutcomes is missing or invalid.`);
    return;
  }
  validateCanonicalOrder(outcomes, scenarioLabel, errors);

  if (runMode === "build-product") {
    for (const gate of CANONICAL_GATES) {
      assertGateStatus(outcomes, scenarioLabel, gate, "passed", errors);
    }
    if (scenario.packagingCalled !== true) {
      errors.push(`${scenarioLabel}: expected packaging executor to run.`);
    }
    if (scenario.installerSmokeCalled !== true) {
      errors.push(`${scenarioLabel}: expected installer-smoke executor to run.`);
    }
    return;
  }

  if (runMode === "standard") {
    for (const gate of ["plan", "implement", "verify", "repair", "approve"]) {
      assertGateStatus(outcomes, scenarioLabel, gate, "passed", errors);
    }
    assertGateStatus(outcomes, scenarioLabel, "package", "skipped", errors);
    assertGateStatus(outcomes, scenarioLabel, "installer-smoke", "skipped", errors);
    if (scenario.packagingCalled !== false) {
      errors.push(`${scenarioLabel}: expected packaging executor to be skipped.`);
    }
    if (scenario.installerSmokeCalled !== false) {
      errors.push(`${scenarioLabel}: expected installer-smoke executor to be skipped.`);
    }
    return;
  }

  errors.push(`Unknown run mode "${String(runMode)}" in generated telemetry scenario.`);
}

function validateGeneratedArtifactOrThrow(artifact) {
  if (!artifact || typeof artifact !== "object") {
    throw new Error("Generated telemetry artifact is not a JSON object.");
  }
  if (!Array.isArray(artifact.scenarios)) {
    throw new Error("Generated telemetry artifact must contain a scenarios array.");
  }

  const errors = [];
  artifact.scenarios.forEach((scenario, index) => validateScenarioContract(scenario, index, errors));

  const buildProductScenarios = artifact.scenarios.filter((scenario) => scenario?.runMode === "build-product");
  const standardScenarios = artifact.scenarios.filter((scenario) => scenario?.runMode === "standard");
  if (buildProductScenarios.length === 0) {
    errors.push('Missing "build-product" scenario in generated telemetry artifact.');
  } else if (buildProductScenarios.length > 1) {
    errors.push(`Expected exactly one "build-product" scenario but found ${buildProductScenarios.length}.`);
  }
  if (standardScenarios.length === 0) {
    errors.push('Missing "standard" scenario in generated telemetry artifact.');
  } else if (standardScenarios.length > 1) {
    errors.push(`Expected exactly one "standard" scenario but found ${standardScenarios.length}.`);
  }

  if (errors.length > 0) {
    throw new Error(`Generated DoD telemetry artifact is malformed:\n- ${errors.join("\n- ")}`);
  }
}

const { AgentTaskRunner } = loadCompiledModule("dist/main/services/agentTaskRunner.js");

function createRunner(workspaceRoot) {
  const settingsStore = {
    get: () => ({
      apiKey: "",
      baseUrl: "https://openrouter.ai/api/v1",
      defaultModel: "qwen/qwen3-coder:free",
      routerPort: 3456,
      models: ["qwen/qwen3-coder:free"],
      customTemplates: [],
      ollamaEnabled: false,
      ollamaBaseUrl: "http://localhost:11434/v1",
      ollamaModels: [],
      localVoiceEnabled: false,
      localVoiceModel: "base",
      mcpServers: [],
      routing: {
        default: "qwen/qwen3-coder:free",
        think: "qwen/qwen3-coder:free",
        longContext: "qwen/qwen3-coder:free"
      }
    })
  };
  return new AgentTaskRunner(workspaceRoot, settingsStore, {});
}

function stubRunnerExecution(runner, workspaceRoot, callFlags) {
  const packageManifest = {
    name: "desktop-smoke",
    main: "dist/main.js",
    scripts: {
      build: "node -e \"console.log('build ok')\"",
      start: "node dist/main.js",
      "package:win": "electron-builder --win nsis"
    },
    devDependencies: {
      electron: "^35.0.0"
    }
  };

  runner.tryReadPackageJson = async () => packageManifest;
  runner.listWorkspaceFiles = async () => [];
  runner.ensureExplicitTaskWorkspace = async () => {};
  runner.detectBootstrapPlan = () => null;
  runner.extractGeneratedAppDirectoryFromPrompt = () => null;
  runner.buildExecutionPlan = async () => ({
    summary: "Plan ready.",
    workingDirectory: "generated-apps/desktop-smoke",
    workspaceKind: "generic",
    builderMode: null,
    candidateFiles: ["generated-apps/desktop-smoke/package.json"],
    requestedPaths: [],
    workItems: [],
    spec: {
      summary: "Desktop release plan.",
      starterProfile: "electron-desktop",
      deliverables: [],
      acceptanceCriteria: [],
      qualityGates: [],
      requiredFiles: [],
      requiredScriptGroups: [],
      expectsReadme: false
    }
  });
  runner.isVerificationOnlyPrompt = () => false;
  runner.prepareGeneratedWorkspace = async () => {};
  runner.pruneUnexpectedGeneratedAppFiles = async () => {};
  runner.verifyExpectedEntryFiles = async () => ({
    id: "entry-files",
    label: "Required entry files",
    status: "passed",
    details: "Entry files are present."
  });
  runner.executeCommand = async () => ({
    ok: true,
    code: 0,
    signal: null,
    stdout: "ok",
    stderr: "",
    combinedOutput: "ok",
    durationMs: 1,
    timedOut: false,
    commandLine: "npm run build",
    cwd: workspaceRoot
  });
  runner.executeArtifactRuntimeVerification = async () => ({
    ok: true,
    code: 0,
    signal: null,
    stdout: "runtime ok",
    stderr: "",
    combinedOutput: "runtime ok",
    durationMs: 1,
    timedOut: false,
    commandLine: "npm run start",
    cwd: workspaceRoot
  });
  runner.verifyRuntimeDepth = async () => ({
    id: "runtime-depth",
    label: "Desktop interaction smoke",
    status: "passed",
    details: "Desktop smoke passed."
  });
  runner.verifyExecutionSpec = async () => [];
  runner.verifyPromptRequirements = async () => [];
  runner.verifyWindowsDesktopPackaging = async () => {
    callFlags.packagingCalled = true;
    return {
      id: "packaging",
      label: "Windows packaging",
      status: "passed",
      details: "Windows packaging passed."
    };
  };
  runner.findGeneratedDesktopInstaller = async () => "generated-apps/desktop-smoke/release/Cipher-Workspace-Setup-1.0.0.exe";
  runner.verifyWindowsInstallerSmoke = async () => {
    callFlags.installerSmokeCalled = true;
    return {
      id: "installer-smoke",
      label: "Windows installer smoke",
      status: "passed",
      details: "Windows installer smoke passed."
    };
  };
  runner.createSnapshot = async () => ({ id: "snapshot-after" });
  runner.persistTaskState = () => {};
  runner.appendLog = () => {};
}

async function runScenario(runMode) {
  const workspaceRoot = await mkdtemp(join(tmpdir(), `cipher-dod-${runMode}-`));
  try {
    const runner = createRunner(workspaceRoot);
    const callFlags = {
      packagingCalled: false,
      installerSmokeCalled: false
    };
    stubRunnerExecution(runner, workspaceRoot, callFlags);

    const now = new Date().toISOString();
    const taskId = `task-dod-${runMode}`;
    runner.tasks = new Map([
      [taskId, {
        id: taskId,
        prompt: "Build a desktop app for order processing.",
        runMode,
        status: "running",
        createdAt: now,
        updatedAt: now,
        summary: "",
        steps: [],
        targetPath: "generated-apps/desktop-smoke",
        artifactType: "desktop-app",
        telemetry: {
          runMode,
          fallbackUsed: false,
          modelAttempts: [],
          dodGateOutcomes: []
        }
      }]
    ]);
    runner.taskLogs = new Map([[taskId, []]]);
    runner.activeTaskId = taskId;

    await runner.runTask(taskId);
    const finished = runner.tasks.get(taskId);
    if (!finished) {
      throw new Error(`DoD scenario task ${taskId} disappeared before completion.`);
    }

    return {
      taskId,
      runMode,
      status: finished.status,
      summary: finished.summary,
      packagingCalled: callFlags.packagingCalled,
      installerSmokeCalled: callFlags.installerSmokeCalled,
      dodGateOutcomes: (finished.telemetry?.dodGateOutcomes ?? []).map((entry) => ({ ...entry }))
    };
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const [buildProduct, standard] = await Promise.all([
    runScenario("build-product"),
    runScenario("standard")
  ]);

  const artifact = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: "scripts/generate-dod-telemetry-artifact.mjs",
    scenarios: [buildProduct, standard]
  };
  validateGeneratedArtifactOrThrow(artifact);

  await mkdir(dirname(options.outputPath), { recursive: true });
  await writeFile(options.outputPath, JSON.stringify(artifact, null, 2), "utf8");
  console.log(`Wrote DoD telemetry artifact to ${options.outputPath}`);
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
