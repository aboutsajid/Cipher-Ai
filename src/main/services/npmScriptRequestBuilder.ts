import type { TerminalCommandRequest } from "../../shared/types";

export function buildNpmScriptRequest(
  scriptName: string,
  timeoutMs: number,
  cwd = ".",
  extraArgs: string[] = []
): TerminalCommandRequest {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const passthrough = extraArgs.length > 0 ? ["--", ...extraArgs] : [];
  if (scriptName === "test" || scriptName === "start") {
    return { command: npmCommand, args: [scriptName, ...passthrough], timeoutMs, cwd };
  }
  return { command: npmCommand, args: ["run", scriptName, ...passthrough], timeoutMs, cwd };
}
