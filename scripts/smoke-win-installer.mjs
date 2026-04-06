import { spawn } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import { mkdtemp, readdir, stat } from "fs/promises";
import { dirname, isAbsolute, join, resolve } from "path";
import { tmpdir } from "os";

const DEFAULT_EXE_NAME = "Cipher Workspace.exe";
const DEFAULT_PRODUCT_NAME = "Cipher Workspace";
const DEFAULT_WAIT_MS = 8_000;
const DEFAULT_REPORT_PATH = resolve("tmp", "win-installer-smoke-report.json");

function printUsage() {
  console.log([
    "Usage: node scripts/smoke-win-installer.mjs [options]",
    "",
    "Options:",
    "  --installer <path>      Explicit installer path. Defaults to release/Cipher-Workspace-Setup-*.exe",
    "  --baseline-installer <path>  Older installer used before upgrade validation.",
    "  --upgrade-installer <path>   Newer installer used for upgrade validation.",
    "  --install-dir <path>    Explicit install directory. Defaults to a temp directory.",
    "  --wait-ms <number>      How long to wait for launch/install state checks. Default: 8000",
    "  --report <path>         JSON report path. Default: tmp/win-installer-smoke-report.json",
    "  --exe-name <name>       Installed executable name. Default: Cipher Workspace.exe",
    "  --product-name <name>   Product name used for uninstaller discovery. Default: Cipher Workspace",
    "  --skip-upgrade          Skip reinstall/upgrade coverage.",
    "  --skip-uninstall        Skip uninstall coverage.",
    "  --keep-install-dir      Keep the install directory after success.",
    "  --help                  Show this usage text."
  ].join("\n"));
}

function parseArgs(argv) {
  const options = {
    installerPath: null,
    baselineInstallerPath: null,
    upgradeInstallerPath: null,
    installDir: null,
    waitMs: DEFAULT_WAIT_MS,
    reportPath: DEFAULT_REPORT_PATH,
    exeName: DEFAULT_EXE_NAME,
    productName: DEFAULT_PRODUCT_NAME,
    skipUpgrade: false,
    skipUninstall: false,
    keepInstallDir: false,
    help: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--installer":
        options.installerPath = argv[++i] ?? null;
        break;
      case "--baseline-installer":
        options.baselineInstallerPath = argv[++i] ?? null;
        break;
      case "--upgrade-installer":
        options.upgradeInstallerPath = argv[++i] ?? null;
        break;
      case "--install-dir":
        options.installDir = argv[++i] ?? null;
        break;
      case "--wait-ms":
        options.waitMs = Number(argv[++i] ?? DEFAULT_WAIT_MS);
        break;
      case "--report":
        options.reportPath = argv[++i] ?? DEFAULT_REPORT_PATH;
        break;
      case "--exe-name":
        options.exeName = argv[++i] ?? DEFAULT_EXE_NAME;
        break;
      case "--product-name":
        options.productName = argv[++i] ?? DEFAULT_PRODUCT_NAME;
        break;
      case "--skip-upgrade":
        options.skipUpgrade = true;
        break;
      case "--skip-uninstall":
        options.skipUninstall = true;
        break;
      case "--keep-install-dir":
        options.keepInstallDir = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(options.waitMs) || options.waitMs < 1_000) {
    throw new Error(`Invalid --wait-ms value: ${options.waitMs}`);
  }

  options.reportPath = isAbsolute(options.reportPath) ? options.reportPath : resolve(options.reportPath);
  if (options.installerPath) {
    options.installerPath = isAbsolute(options.installerPath) ? options.installerPath : resolve(options.installerPath);
  }
  if (options.baselineInstallerPath) {
    options.baselineInstallerPath = isAbsolute(options.baselineInstallerPath)
      ? options.baselineInstallerPath
      : resolve(options.baselineInstallerPath);
  }
  if (options.upgradeInstallerPath) {
    options.upgradeInstallerPath = isAbsolute(options.upgradeInstallerPath)
      ? options.upgradeInstallerPath
      : resolve(options.upgradeInstallerPath);
  }
  if (options.installDir) {
    options.installDir = isAbsolute(options.installDir) ? options.installDir : resolve(options.installDir);
  }

  return options;
}

function writeReport(reportPath, report) {
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function now() {
  return new Date().toISOString();
}

async function run(command, args, options = {}) {
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      windowsHide: true,
      ...options
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("error", rejectPromise);
    child.once("exit", (code) => {
      if (code === 0) {
        resolvePromise({ stdout, stderr, code });
        return;
      }
      rejectPromise(new Error(`${command} ${args.join(" ")} failed with code ${code}.\n${stderr || stdout}`.trim()));
    });
  });
}

function delay(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function listProcessesByName(imageName) {
  const script = [
    `$name = ${toPowerShellStringLiteral(imageName)}`,
    "Get-CimInstance Win32_Process |",
    "  Where-Object { $_.Name -eq $name } |",
    "  Select-Object ProcessId, Name, ExecutablePath, CommandLine |",
    "  ConvertTo-Json -Compress"
  ].join("\n");

  const { stdout } = await run("powershell.exe", ["-NoProfile", "-Command", script]);
  const trimmed = stdout.trim();
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function toPowerShellStringLiteral(value) {
  return `'${String(value ?? "").replace(/'/g, "''")}'`;
}

async function listAppProcesses(executableName, executablePath = null) {
  const processes = await listProcessesByName(executableName);
  const normalizedPath = executablePath ? executablePath.toLowerCase() : null;
  return processes.filter((processInfo) => {
    const processPath = String(processInfo.ExecutablePath ?? "").toLowerCase();
    if (!normalizedPath) return true;
    return processPath === normalizedPath;
  });
}

async function ensureNoRunningCipherWorkspace(executableName) {
  const running = await listAppProcesses(executableName);
  if (running.length > 0) {
    throw new Error(`Close all running ${executableName} instances before running smoke:win:install.`);
  }
}

async function stopProcesses(processes) {
  for (const processInfo of processes) {
    const pid = Number(processInfo.ProcessId);
    if (!Number.isFinite(pid) || pid <= 0) continue;
    await run("taskkill", ["/PID", String(pid), "/F"]);
  }
}

async function stopAppProcesses(executableName, executablePath = null) {
  const running = await listAppProcesses(executableName, executablePath);
  if (running.length === 0) return;
  await stopProcesses(running);
}

async function findInstaller(explicitPath = null) {
  if (explicitPath) {
    if (!(await pathExists(explicitPath))) {
      throw new Error(`Installer not found: ${explicitPath}`);
    }
    return explicitPath;
  }

  const releaseDir = resolve("release");
  const entries = await readdir(releaseDir);
  const installers = entries
    .filter((entry) => /^Cipher-Workspace-Setup-.*\.exe$/i.test(entry))
    .sort((a, b) => b.localeCompare(a));
  if (installers.length === 0) {
    throw new Error("Windows installer not found in release/. Run npm run pack:win first.");
  }
  return join(releaseDir, installers[0]);
}

async function findLatestInstallers(count = 2) {
  const releaseDir = resolve("release");
  const entries = await readdir(releaseDir);
  return entries
    .filter((entry) => /^Cipher-Workspace-Setup-.*\.exe$/i.test(entry))
    .sort((a, b) => b.localeCompare(a))
    .slice(0, count)
    .map((entry) => join(releaseDir, entry));
}

function getExecutablePath(installDir, exeName) {
  return join(installDir, exeName);
}

function getUninstallerCandidates(installDir, productName) {
  const sanitized = productName.replace(/[<>:"/\\|?*]+/g, "").trim();
  return [
    join(installDir, `Uninstall ${sanitized}.exe`),
    join(installDir, `Uninstall ${sanitized}.EXE`),
    join(installDir, "Uninstall.exe"),
    join(installDir, "uninstall.exe")
  ];
}

async function findUninstaller(installDir, productName) {
  for (const candidate of getUninstallerCandidates(installDir, productName)) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }
  throw new Error(`Could not find an uninstaller in ${installDir}.`);
}

async function waitForLaunch(executableName, executablePath, waitMs) {
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    const running = await listAppProcesses(executableName, executablePath);
    if (running.length > 0) {
      return running;
    }
    await delay(500);
  }
  return [];
}

async function waitForPathRemoval(targetPath, waitMs) {
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    if (!(await pathExists(targetPath))) {
      return true;
    }
    await delay(500);
  }
  return !(await pathExists(targetPath));
}

async function runStep(report, name, action) {
  const step = { name, status: "running", startedAt: now() };
  report.steps.push(step);
  try {
    const details = await action();
    step.status = "passed";
    step.finishedAt = now();
    if (details !== undefined) {
      step.details = details;
    }
    writeReport(report.reportPath, report);
    return details;
  } catch (error) {
    step.status = "failed";
    step.finishedAt = now();
    step.error = error instanceof Error ? error.message : String(error);
    report.status = "failed";
    report.error = step.error;
    writeReport(report.reportPath, report);
    throw error;
  }
}

async function runInstaller(installerPath, installDir) {
  await run(installerPath, ["/S", `/D=${installDir}`], { cwd: dirname(installerPath) });
}

async function launchInstalledApp(executablePath, installDir) {
  const childEnv = { ...process.env };
  delete childEnv.ELECTRON_RUN_AS_NODE;

  const app = spawn(executablePath, [], {
    cwd: installDir,
    detached: true,
    stdio: "ignore",
    env: childEnv,
    windowsHide: true
  });
  app.unref();
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  if (process.platform !== "win32") {
    throw new Error("smoke-win-installer is only supported on Windows.");
  }

  const report = {
    generatedAt: now(),
    status: "running",
    reportPath: options.reportPath,
    installerPath: null,
    baselineInstallerPath: null,
    upgradeInstallerPath: null,
    installDir: null,
    executablePath: null,
    exeName: options.exeName,
    productName: options.productName,
    waitMs: options.waitMs,
    skipUpgrade: options.skipUpgrade,
    skipUninstall: options.skipUninstall,
    keepInstallDir: options.keepInstallDir,
    steps: []
  };
  writeReport(report.reportPath, report);

  let installerPath = null;
  let baselineInstallerPath = null;
  let upgradeInstallerPath = null;

  if (options.baselineInstallerPath || options.upgradeInstallerPath) {
    if (!options.baselineInstallerPath || !options.upgradeInstallerPath) {
      throw new Error("Provide both --baseline-installer and --upgrade-installer when running version-to-version smoke.");
    }
    baselineInstallerPath = await findInstaller(options.baselineInstallerPath);
    upgradeInstallerPath = await findInstaller(options.upgradeInstallerPath);
    installerPath = upgradeInstallerPath;
  } else {
    installerPath = await findInstaller(options.installerPath);
    const latestInstallers = await findLatestInstallers(2);
    if (latestInstallers.length >= 2 && latestInstallers[0] !== latestInstallers[1]) {
      baselineInstallerPath = latestInstallers[1];
      upgradeInstallerPath = latestInstallers[0];
    }
  }

  const installDir = options.installDir ?? await mkdtemp(join(tmpdir(), "cipher-workspace-install-"));
  mkdirSync(installDir, { recursive: true });
  const executablePath = getExecutablePath(installDir, options.exeName);

  report.installerPath = installerPath;
  report.baselineInstallerPath = baselineInstallerPath;
  report.upgradeInstallerPath = upgradeInstallerPath;
  report.installDir = installDir;
  report.executablePath = executablePath;
  writeReport(report.reportPath, report);

  console.log(`Installer: ${installerPath}`);
  if (baselineInstallerPath && upgradeInstallerPath) {
    console.log(`Baseline installer: ${baselineInstallerPath}`);
    console.log(`Upgrade installer: ${upgradeInstallerPath}`);
  }
  console.log(`Install dir: ${installDir}`);
  console.log(`Report: ${report.reportPath}`);

  await runStep(report, "preflight", async () => {
    await ensureNoRunningCipherWorkspace(options.exeName);
    return { runningInstances: 0 };
  });

  if (baselineInstallerPath && upgradeInstallerPath && !options.skipUpgrade) {
    await runStep(report, "install-baseline", async () => {
      await runInstaller(baselineInstallerPath, installDir);
      if (!(await pathExists(executablePath))) {
        throw new Error(`Baseline executable not found: ${executablePath}`);
      }
      return { executablePath, installerPath: baselineInstallerPath };
    });

    await runStep(report, "launch-baseline", async () => {
      await launchInstalledApp(executablePath, installDir);
      const running = await waitForLaunch(options.exeName, executablePath, options.waitMs);
      if (running.length === 0) {
        throw new Error(`Baseline app did not stay running from ${executablePath}.`);
      }
      await stopProcesses(running);
      return { processCount: running.length };
    });

    await runStep(report, "upgrade", async () => {
      await runInstaller(upgradeInstallerPath, installDir);
      if (!(await pathExists(executablePath))) {
        throw new Error(`Executable missing after upgrade: ${executablePath}`);
      }
      return { executablePath, installerPath: upgradeInstallerPath };
    });

    await runStep(report, "launch-upgraded", async () => {
      await launchInstalledApp(executablePath, installDir);
      const running = await waitForLaunch(options.exeName, executablePath, options.waitMs);
      if (running.length === 0) {
        throw new Error(`Upgraded app did not stay running from ${executablePath}.`);
      }
      await stopProcesses(running);
      return { processCount: running.length };
    });
  } else {
    await runStep(report, "install", async () => {
      await runInstaller(installerPath, installDir);
      if (!(await pathExists(executablePath))) {
        throw new Error(`Installed executable not found: ${executablePath}`);
      }
      return { executablePath };
    });

    await runStep(report, "launch", async () => {
      await launchInstalledApp(executablePath, installDir);
      const running = await waitForLaunch(options.exeName, executablePath, options.waitMs);
      if (running.length === 0) {
        throw new Error(`Installed app did not stay running from ${executablePath}.`);
      }
      await stopProcesses(running);
      return { processCount: running.length };
    });
  }

  if (!baselineInstallerPath || !upgradeInstallerPath) {
    if (!options.skipUpgrade) {
      await runStep(report, "reinstall", async () => {
        await runInstaller(installerPath, installDir);
        if (!(await pathExists(executablePath))) {
          throw new Error(`Executable missing after reinstall: ${executablePath}`);
        }
        return { executablePath };
      });

      await runStep(report, "relaunch", async () => {
        await launchInstalledApp(executablePath, installDir);
        const running = await waitForLaunch(options.exeName, executablePath, options.waitMs);
        if (running.length === 0) {
          throw new Error(`Reinstalled app did not stay running from ${executablePath}.`);
        }
        await stopProcesses(running);
        return { processCount: running.length };
      });
    }
  }

  if (!options.skipUninstall) {
    await runStep(report, "uninstall", async () => {
      const uninstallerPath = await findUninstaller(installDir, options.productName);
      await run(uninstallerPath, ["/S"], { cwd: dirname(uninstallerPath) });
      const removed = await waitForPathRemoval(executablePath, options.waitMs);
      await stopAppProcesses(options.exeName, executablePath);
      if (!removed) {
        throw new Error(`Installed executable still exists after uninstall: ${executablePath}`);
      }
      return { uninstallerPath };
    });
  }

  report.status = "passed";
  report.finishedAt = now();
  writeReport(report.reportPath, report);
  console.log(`Windows installer smoke passed. Report: ${report.reportPath}`);

  if (options.keepInstallDir) {
    console.log(`Install directory preserved: ${installDir}`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
