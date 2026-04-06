import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { basename, dirname, isAbsolute, resolve } from "path";

function printUsage() {
  console.log([
    "Usage: node scripts/format-win-smoke-report.mjs <report.json> [options]",
    "",
    "Options:",
    "  --title <text>            Markdown heading. Default: Windows Smoke Report",
    "  --output <path>           Optional markdown output path.",
    "  --github-step-summary     Append markdown to GITHUB_STEP_SUMMARY when available.",
    "  --allow-missing           Exit cleanly if the report file does not exist.",
    "  --help                    Show this usage text."
  ].join("\n"));
}

function parseArgs(argv) {
  const options = {
    reportPath: null,
    title: "Windows Smoke Report",
    outputPath: null,
    githubStepSummary: false,
    allowMissing: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--title":
        options.title = argv[++index] ?? options.title;
        break;
      case "--output":
        options.outputPath = argv[++index] ?? null;
        break;
      case "--github-step-summary":
        options.githubStepSummary = true;
        break;
      case "--allow-missing":
        options.allowMissing = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        if (!options.reportPath) {
          options.reportPath = arg;
          break;
        }
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (options.outputPath) {
    options.outputPath = isAbsolute(options.outputPath) ? options.outputPath : resolve(options.outputPath);
  }
  if (options.reportPath) {
    options.reportPath = isAbsolute(options.reportPath) ? options.reportPath : resolve(options.reportPath);
  }
  return options;
}

function safeReadJson(reportPath, allowMissing) {
  try {
    const raw = readFileSync(reportPath, "utf8").replace(/^\uFEFF/, "");
    return JSON.parse(raw);
  } catch (error) {
    if (allowMissing && error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function summarizeSteps(steps) {
  const normalizedSteps = Array.isArray(steps) ? steps : [];
  const passed = normalizedSteps.filter((step) => step?.status === "passed").length;
  const failed = normalizedSteps.filter((step) => step?.status === "failed").length;
  return { normalizedSteps, passed, failed };
}

function formatDetails(details) {
  if (!details || typeof details !== "object") return null;
  const entries = Object.entries(details).filter(([, value]) => value !== undefined && value !== null && value !== "");
  if (entries.length === 0) return null;
  return entries.map(([key, value]) => `${key}: ${String(value)}`).join(", ");
}

function buildMarkdown(title, report) {
  const { normalizedSteps, passed, failed } = summarizeSteps(report?.steps);
  const mode = report?.baselineInstallerPath && report?.upgradeInstallerPath ? "upgrade" : "install";
  const lines = [
    `# ${title}`,
    "",
    `- Status: ${report?.status ?? "unknown"}`,
    `- Mode: ${mode}`,
    `- Generated: ${report?.generatedAt ?? "unknown"}`,
    `- Passed steps: ${passed}`,
    `- Failed steps: ${failed}`
  ];

  if (report?.installerPath) lines.push(`- Installer: ${basename(report.installerPath)}`);
  if (report?.baselineInstallerPath) lines.push(`- Baseline installer: ${basename(report.baselineInstallerPath)}`);
  if (report?.upgradeInstallerPath) lines.push(`- Upgrade installer: ${basename(report.upgradeInstallerPath)}`);
  if (report?.finishedAt) lines.push(`- Finished: ${report.finishedAt}`);
  if (report?.error) lines.push(`- Error: ${report.error}`);

  lines.push("", "## Steps");
  for (const step of normalizedSteps) {
    const status = step?.status ?? "unknown";
    lines.push(`- ${step?.name ?? "unknown"}: ${status}`);
    const details = formatDetails(step?.details);
    if (details) lines.push(`  ${details}`);
    if (step?.error) lines.push(`  error: ${step.error}`);
  }

  return `${lines.join("\n")}\n`;
}

function writeFile(targetPath, content) {
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, content, "utf8");
}

function appendStepSummary(content) {
  const stepSummaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!stepSummaryPath) return false;
  writeFileSync(stepSummaryPath, `${content}\n`, { encoding: "utf8", flag: "a" });
  return true;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !options.reportPath) {
    printUsage();
    return;
  }

  const report = safeReadJson(options.reportPath, options.allowMissing);
  if (!report) {
    const missingMessage = `# ${options.title}\n\n- Status: skipped\n- Reason: report file not found\n`;
    if (options.outputPath) writeFile(options.outputPath, missingMessage);
    if (options.githubStepSummary) appendStepSummary(missingMessage);
    process.stdout.write(missingMessage);
    return;
  }

  const markdown = buildMarkdown(options.title, report);
  if (options.outputPath) writeFile(options.outputPath, markdown);
  if (options.githubStepSummary) appendStepSummary(markdown);
  process.stdout.write(markdown);
}

main();
