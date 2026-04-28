import type { TerminalCommandRequest } from "../../shared/types";

export type BootstrapTemplate = "react-vite" | "nextjs" | "static" | "node-package";

export function buildBootstrapCommands(
  template: BootstrapTemplate,
  targetDirectory: string,
  options: { platform?: NodeJS.Platform } = {}
): TerminalCommandRequest[] {
  const platform = options.platform ?? process.platform;
  const npmCommand = platform === "win32" ? "npm.cmd" : "npm";
  const npxCommand = platform === "win32" ? "npx.cmd" : "npx";

  if (template === "nextjs") {
    return [{
      command: npxCommand,
      args: ["create-next-app@latest", targetDirectory, "--ts", "--eslint", "--app", "--src-dir", "--use-npm", "--yes"],
      timeoutMs: 300_000
    }];
  }

  if (template === "static") {
    return [];
  }

  if (template === "node-package") {
    return [];
  }

  return [
    {
      command: npmCommand,
      args: ["create", "vite@latest", targetDirectory, "--", "--template", "react-ts"],
      timeoutMs: 180_000
    },
    {
      command: npmCommand,
      args: ["install"],
      cwd: targetDirectory,
      timeoutMs: 180_000
    }
  ];
}
