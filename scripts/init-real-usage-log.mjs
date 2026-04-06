import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, isAbsolute, resolve } from "path";

const DEFAULT_WORKSPACE_ROOT = process.cwd();
const DEFAULT_OUTPUT = resolve(DEFAULT_WORKSPACE_ROOT, "tmp", "agent-real-usage-log.md");

const REPORT_SPECS = [
  { label: "Core soak", file: "agent-soak-report.json" },
  { label: "Realworld", file: "agent-realworld-report.json" },
  { label: "Messy", file: "agent-messy-report.json" },
  { label: "Manual freeform", file: "agent-manual-freeform-report.json" }
];

function printUsage() {
  console.log([
    "Usage: node scripts/init-real-usage-log.mjs [options]",
    "",
    "Options:",
    "  --output <path>           Markdown output path. Default: tmp/agent-real-usage-log.md",
    "  --workspace-root <path>   Workspace root used for report discovery. Default: cwd",
    "  --date <YYYY-MM-DD>       Optional session date override. Default: today",
    "  --help                    Show this usage text."
  ].join("\n"));
}

function parseArgs(argv) {
  const options = {
    outputPath: DEFAULT_OUTPUT,
    workspaceRoot: DEFAULT_WORKSPACE_ROOT,
    sessionDate: new Date().toISOString().slice(0, 10),
    help: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--output":
        options.outputPath = argv[++i] ?? DEFAULT_OUTPUT;
        break;
      case "--workspace-root":
        options.workspaceRoot = argv[++i] ?? DEFAULT_WORKSPACE_ROOT;
        break;
      case "--date":
        options.sessionDate = argv[++i] ?? options.sessionDate;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  options.workspaceRoot = isAbsolute(options.workspaceRoot)
    ? options.workspaceRoot
    : resolve(options.workspaceRoot);
  options.outputPath = isAbsolute(options.outputPath)
    ? options.outputPath
    : resolve(options.workspaceRoot, options.outputPath);

  return options;
}

function readJsonIfPresent(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function formatBaselineLine(label, report) {
  const totals = report?.totals;
  if (!totals || typeof totals !== "object") {
    return `- ${label}: unavailable`;
  }

  const scenarios = Number(totals.scenarios ?? 0);
  const run = Number(totals.run ?? 0);
  const failed = Number(totals.failed ?? 0);
  const fallbackUsed = Number(totals.fallbackUsed ?? 0);
  const blacklisted = Number(totals.blacklistedScenarios ?? 0);
  const verificationPassed = Number(totals.verificationPassed ?? 0);

  return `- ${label}: ${run}/${scenarios} run, ${failed} failed, ${fallbackUsed} fallback, ${blacklisted} blacklisted, ${verificationPassed} verification passed`;
}

function buildMarkdown(options) {
  const baselineLines = REPORT_SPECS.map((spec) => {
    const reportPath = resolve(options.workspaceRoot, "tmp", spec.file);
    return formatBaselineLine(spec.label, readJsonIfPresent(reportPath));
  });

  return [
    "# Real Usage Prompt Log",
    "",
    `Date: ${options.sessionDate}`,
    `Workspace: ${options.workspaceRoot}`,
    "",
    "## Current Baseline",
    ...baselineLines,
    "",
    "## Session Rules",
    "- Log real prompts from actual use, not only curated pack prompts.",
    "- Record one entry per prompt run, even if the result was a partial success.",
    "- If a prompt needed rescue, include the exact confusion, drift, or failure point.",
    "- Promote repeatable wins into prompt packs and convert repeatable misses into regressions or verifier fixes.",
    "",
    "## Triage Labels",
    "- `strong-pass`: right artifact, clean verification, no manual rescue, user-visible result matched the prompt.",
    "- `soft-pass`: completed but misleading UI, shallow verification, retries, or avoidable drift.",
    "- `fail`: wrong artifact, broken runtime, missing prompt requirements, or manual rescue required.",
    "",
    "## Daily Checklist",
    "- Open one Agent window and one Chat window.",
    "- Run 3-10 real prompts from actual work, not paraphrased benchmark prompts.",
    "- Copy result-card summaries or key verification lines into each log entry.",
    "- End the session by listing the top 1-3 follow-up fixes or prompt-pack additions.",
    "",
    "## Entry Template",
    "",
    "```md",
    "### Prompt",
    "- Time:",
    "- Prompt text:",
    "- Intent category: web / desktop / api / tool / library / unknown",
    "- Expected artifact:",
    "",
    "### Outcome",
    "- Triage: strong-pass / soft-pass / fail",
    "- Actual artifact:",
    "- Verification summary:",
    "- Manual rescue needed: yes/no",
    "- Multi-window stayed usable: yes/no",
    "- Chat stayed usable in second window: yes/no",
    "",
    "### Notes",
    "- What worked:",
    "- What broke:",
    "- Follow-up candidate:",
    "- Promote to prompt pack: yes/no",
    "```",
    "",
    "## Session Entries",
    "",
    "## Follow-Up Backlog",
    "- ",
    "",
    "## Promotion Candidates",
    "- "
  ].join("\n");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const markdown = buildMarkdown(options);
  mkdirSync(dirname(options.outputPath), { recursive: true });
  writeFileSync(options.outputPath, `${markdown}\n`, "utf8");
  console.log(`Real-usage log initialized at ${options.outputPath}`);
}

main();
