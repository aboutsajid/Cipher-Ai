import type { TerminalCommandRequest } from "../../shared/types";

export function parseCommandArgs(command: string): string[] {
  const tokens = command.match(/"([^"\\]|\\.)*"|'([^'\\]|\\.)*'|\S+/g) ?? [];
  return tokens.map((token) => {
    const trimmed = token.trim();
    if (
      (trimmed.startsWith("\"") && trimmed.endsWith("\""))
      || (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      return trimmed.slice(1, -1);
    }
    return trimmed;
  });
}

export function buildElectronBuilderPackagingRequest(
  script: string,
  workingDirectory: string,
  outputDirectory: string
): TerminalCommandRequest | null {
  const normalizedScript = (script ?? "").trim();
  if (!/^electron-builder(?:\s|$)/i.test(normalizedScript)) return null;

  const scriptArgs = parseCommandArgs(normalizedScript.replace(/^electron-builder(?:\s+)?/i, ""))
    .filter((arg) => !/^--config\.directories\.output=/i.test(arg));

  return {
    command: process.platform === "win32" ? "npm.cmd" : "npm",
    args: ["exec", "electron-builder", "--", ...scriptArgs, `--config.directories.output=${outputDirectory}`],
    cwd: workingDirectory,
    timeoutMs: 300_000
  };
}
