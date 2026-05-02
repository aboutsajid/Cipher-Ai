import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const CANONICAL_GATES = [
  "plan",
  "implement",
  "verify",
  "repair",
  "package",
  "installer-smoke",
  "approve"
];

function printUsage() {
  console.log([
    "Usage: node scripts/verify-dod-telemetry-contract.mjs [artifact.json] [options]",
    "",
    "Options:",
    "  --output <path>           Optional markdown summary output path.",
    "  --github-step-summary     Append markdown summary to GITHUB_STEP_SUMMARY.",
    "  --help                    Show this usage text."
  ].join("\n"));
}

function parseArgs(argv) {
  const options = {
    artifactPath: resolve("tmp", "agent-dod-telemetry-contract.json"),
    outputPath: null,
    githubStepSummary: false,
    help: false
  };
  let artifactProvided = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--github-step-summary") {
      options.githubStepSummary = true;
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
    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    if (artifactProvided) {
      throw new Error(`Unexpected argument: ${arg}`);
    }
    options.artifactPath = resolve(arg);
    artifactProvided = true;
  }

  return options;
}

async function loadArtifact(artifactPath) {
  const raw = await readFile(artifactPath, "utf8");
  return JSON.parse(raw.replace(/^\uFEFF/, ""));
}

function gateStatus(outcomes, gate) {
  const match = outcomes.find((entry) => entry.gate === gate);
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

function validateScenario(scenario, errors) {
  const scenarioLabel = `${scenario?.runMode ?? "unknown"} scenario`;
  const outcomes = Array.isArray(scenario?.dodGateOutcomes) ? scenario.dodGateOutcomes : [];
  if (!Array.isArray(scenario?.dodGateOutcomes)) {
    errors.push(`${scenarioLabel}: dodGateOutcomes is missing or invalid.`);
    return;
  }

  validateCanonicalOrder(outcomes, scenarioLabel, errors);

  if (scenario?.status !== "completed") {
    errors.push(`${scenarioLabel}: expected task status "completed" but found "${scenario?.status ?? "missing"}".`);
  }

  if (scenario.runMode === "build-product") {
    for (const gate of CANONICAL_GATES) {
      assertGateStatus(outcomes, scenarioLabel, gate, "passed", errors);
    }
    return;
  }

  if (scenario.runMode === "standard") {
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

  errors.push(`Unknown run mode "${String(scenario?.runMode)}" in telemetry artifact.`);
}

function buildMarkdownSummary(options, artifact, errors) {
  const lines = [
    "# Agent DoD Telemetry Contract",
    "",
    `- Artifact: ${options.artifactPath}`,
    `- Generated: ${artifact?.generatedAt ?? "unknown"}`,
    `- Status: ${errors.length === 0 ? "passed" : "failed"}`
  ];

  const scenarios = Array.isArray(artifact?.scenarios) ? artifact.scenarios : [];
  if (scenarios.length > 0) {
    lines.push("", "## Scenarios");
    for (const scenario of scenarios) {
      const gateSummary = Array.isArray(scenario?.dodGateOutcomes)
        ? scenario.dodGateOutcomes.map((entry) => `${entry.gate}:${entry.status}`).join(", ")
        : "(missing gate outcomes)";
      lines.push(`- ${scenario.runMode ?? "unknown"}: ${scenario.status ?? "unknown"} | ${gateSummary}`);
    }
  }

  if (errors.length > 0) {
    lines.push("", "## Failures");
    for (const error of errors) {
      lines.push(`- ${error}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

async function writeSummary(options, markdown) {
  if (options.outputPath) {
    await mkdir(dirname(options.outputPath), { recursive: true });
    await writeFile(options.outputPath, markdown, "utf8");
  }
  if (options.githubStepSummary) {
    const stepSummary = process.env.GITHUB_STEP_SUMMARY;
    if (stepSummary) {
      await appendFile(stepSummary, `${markdown}\n`, "utf8");
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const artifact = await loadArtifact(options.artifactPath);
  const errors = [];

  if (!artifact || typeof artifact !== "object") {
    throw new Error("Telemetry artifact is not a JSON object.");
  }
  if (!Array.isArray(artifact.scenarios)) {
    throw new Error("Telemetry artifact must contain a scenarios array.");
  }

  const buildProductScenario = artifact.scenarios.find((entry) => entry?.runMode === "build-product");
  const standardScenario = artifact.scenarios.find((entry) => entry?.runMode === "standard");
  if (!buildProductScenario) {
    errors.push('Missing "build-product" scenario in telemetry artifact.');
  }
  if (!standardScenario) {
    errors.push('Missing "standard" scenario in telemetry artifact.');
  }

  if (buildProductScenario) validateScenario(buildProductScenario, errors);
  if (standardScenario) validateScenario(standardScenario, errors);

  const markdown = buildMarkdownSummary(options, artifact, errors);
  await writeSummary(options, markdown);
  process.stdout.write(markdown);

  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
