import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";

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

const {
  appendAgentSoakHistory,
  attachAgentSoakTrendSummary,
  buildAgentSoakReport,
  formatAgentSoakMarkdown,
  normalizeAgentSoakHistory,
  normalizeAgentSoakScenarios
} = loadCompiledModule("dist/shared/agentSoak.js");
const { AGENT_SOAK_SCENARIOS } = loadCompiledModule("dist/shared/agentSoakScenarios.js");

function stripUtf8Bom(value) {
  return typeof value === "string" ? value.replace(/^\uFEFF/, "") : value;
}

function parseArgs(argv) {
  const args = [...argv];
  let command = "report";
  if (args[0] && !args[0].startsWith("--")) {
    command = args.shift();
  }

  const options = {};
  while (args.length > 0) {
    const key = args.shift();
    if (!key?.startsWith("--")) {
      throw new Error(`Unexpected argument: ${key}`);
    }
    const value = args.shift();
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${key}`);
    }
    options[key.slice(2)] = value;
  }

  return { command, options };
}

async function readPersistedTasks(taskStatePath) {
  try {
    const raw = await readFile(taskStatePath, "utf8");
    const parsed = JSON.parse(stripUtf8Bom(raw));
    return Array.isArray(parsed?.tasks) ? parsed.tasks : [];
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function readJsonFile(filePath, fallback) {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(stripUtf8Bom(raw));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

function formatPromptCatalogMarkdown() {
  return formatScenarioCatalogMarkdown(AGENT_SOAK_SCENARIOS);
}

function formatScenarioCatalogMarkdown(scenarios) {
  const lines = [
    "# Agent Soak Prompt Catalog",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    `Scenarios: ${scenarios.length}`,
    ""
  ];

  let currentCategory = "";
  for (const scenario of scenarios) {
    if (scenario.category !== currentCategory) {
      currentCategory = scenario.category;
      lines.push(`## ${currentCategory}`, "");
    }
    lines.push(`### ${scenario.title} [${scenario.id}]`);
    if (scenario.expectedArtifactType) {
      lines.push(`- Expected artifact: ${scenario.expectedArtifactType}`);
    }
    lines.push(`- Prompt: ${scenario.prompt}`, "");
  }

  return lines.join("\n").trimEnd();
}

async function writeOutputFile(filePath, content) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

async function loadScenarioCatalog(scenariosFile) {
  if (!scenariosFile) return [...AGENT_SOAK_SCENARIOS];
  const raw = await readJsonFile(resolve(scenariosFile), []);
  const scenarios = normalizeAgentSoakScenarios(raw);
  if (scenarios.length === 0) {
    throw new Error(`No valid agent soak scenarios were found in ${resolve(scenariosFile)}.`);
  }
  return scenarios;
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  const workspaceRoot = resolve(options.workspace ?? process.cwd());
  const scenarioCatalog = await loadScenarioCatalog(options["scenarios-file"]);

  if (command === "prompts") {
    const outputPath = resolve(options.markdown ?? join(workspaceRoot, "tmp", "agent-soak-prompts.md"));
    const markdown = formatScenarioCatalogMarkdown(scenarioCatalog);
    await writeOutputFile(outputPath, markdown);
    console.log(`Wrote agent soak prompt catalog to ${outputPath}`);
    return;
  }

  if (command !== "report") {
    throw new Error(`Unsupported command "${command}". Use "report" or "prompts".`);
  }

  const taskStatePath = resolve(options.state ?? join(workspaceRoot, ".cipher-snapshots", "agent-task-state.json"));
  const markdownPath = resolve(options.markdown ?? join(workspaceRoot, "tmp", "agent-soak-report.md"));
  const jsonPath = resolve(options.json ?? join(workspaceRoot, "tmp", "agent-soak-report.json"));
  const historyPath = resolve(options.history ?? join(workspaceRoot, "tmp", "agent-soak-history.json"));
  const historyLimit = Math.max(1, Number.parseInt(String(options["history-limit"] ?? "30"), 10) || 30);
  const tasks = await readPersistedTasks(taskStatePath);
  const history = normalizeAgentSoakHistory(await readJsonFile(historyPath, { version: 1, runs: [] }));
  const currentReport = buildAgentSoakReport(scenarioCatalog, tasks, new Date().toISOString());
  const nextHistory = appendAgentSoakHistory(history, currentReport, historyLimit);
  const report = attachAgentSoakTrendSummary(currentReport, nextHistory);
  const markdown = formatAgentSoakMarkdown(report);

  await writeOutputFile(markdownPath, markdown);
  await writeOutputFile(jsonPath, JSON.stringify(report, null, 2));
  await writeOutputFile(historyPath, JSON.stringify(nextHistory, null, 2));

  console.log(`Wrote agent soak report for ${report.totals.scenarios} scenarios to ${markdownPath}`);
  console.log(`Wrote machine-readable soak telemetry to ${jsonPath}`);
  console.log(`Updated soak history at ${historyPath}`);
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
