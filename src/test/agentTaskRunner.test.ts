import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { EventEmitter } from "node:events";
import { AgentTaskRunner } from "../main/services/agentTaskRunner";
import type { Settings } from "../shared/types";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "cipher-runner-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function createRunner(workspaceRoot: string): AgentTaskRunner {
  const settingsStore = {
    get: (): Settings => ({
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
  const ccrService = {};
  return new AgentTaskRunner(workspaceRoot, settingsStore as never, ccrService as never);
}

function createRunnerWithServices(workspaceRoot: string, settingsOverrides: Partial<Settings> = {}, ccrOverrides: Record<string, unknown> = {}): AgentTaskRunner {
  const settingsStore = {
    get: (): Settings => ({
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
      },
      ...settingsOverrides
    })
  };
  return new AgentTaskRunner(workspaceRoot, settingsStore as never, ccrOverrides as never);
}

test("AgentTaskRunner writes files inside the workspace and returns normalized relative paths", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot);

    const result = await runner.writeWorkspaceFile("nested\\note.txt", "hello world");

    assert.equal(result.ok, true);
    assert.equal(result.path, "nested/note.txt");
    assert.equal(result.size, 11);
  });
});

test("AgentTaskRunner rejects writes that escape the workspace root", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot);

    await assert.rejects(
      () => runner.writeWorkspaceFile("../escape.txt", "nope"),
      /Path escapes the workspace root\./
    );
  });
});

test("AgentTaskRunner rejects oversized writes and oversized reads", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot);
    const oversized = "a".repeat(256_001);

    await assert.rejects(
      () => runner.writeWorkspaceFile("too-large.txt", oversized),
      /File is too large to write in-app/
    );

    const largePath = join(workspaceRoot, "too-large-read.txt");
    await writeFile(largePath, oversized, "utf8");

    await assert.rejects(
      () => runner.readWorkspaceFile("too-large-read.txt"),
      /File is too large to read in-app/
    );
  });
});

test("AgentTaskRunner retries transient workspace filesystem errors", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      withWorkspaceFsRetry: <T>(operation: () => Promise<T>, attempts?: number, delayMs?: number) => Promise<T>;
    };

    let attempts = 0;
    const result = await runner.withWorkspaceFsRetry(async () => {
      attempts += 1;
      if (attempts < 3) {
        const error = new Error("resource busy") as Error & { code?: string };
        error.code = "EBUSY";
        throw error;
      }
      return "ok";
    }, 4, 1);

    assert.equal(result, "ok");
    assert.equal(attempts, 3);
  });
});

test("AgentTaskRunner does not retry non-transient workspace filesystem errors", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      withWorkspaceFsRetry: <T>(operation: () => Promise<T>, attempts?: number, delayMs?: number) => Promise<T>;
    };

    let attempts = 0;
    await assert.rejects(
      () => runner.withWorkspaceFsRetry(async () => {
        attempts += 1;
        const error = new Error("denied") as Error & { code?: string };
        error.code = "EACCES";
        throw error;
      }, 4, 1),
      /denied/
    );

    assert.equal(attempts, 1);
  });
});

test("AgentTaskRunner retries a failed task with the original prompt", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      tasks: Map<string, {
        id: string;
        prompt: string;
        status: "failed" | "stopped" | "completed" | "running";
        createdAt: string;
        updatedAt: string;
        summary: string;
        steps: unknown[];
        rollbackSnapshotId?: string;
        targetPath?: string;
        telemetry: { fallbackUsed: boolean; modelAttempts: unknown[] };
      }>;
      restartTask: (taskId: string, mode: "retry" | "retry-clean" | "continue-fix") => Promise<{ id: string; prompt: string }>;
      startTask: (prompt: string) => Promise<{ id: string; prompt: string }>;
    };

    const now = new Date().toISOString();
    runner.tasks = new Map([[
      "task-1",
      {
        id: "task-1",
        prompt: "Build a desktop notes app.",
        status: "failed",
        createdAt: now,
        updatedAt: now,
        summary: "Build failed.",
        steps: [],
        targetPath: "generated-apps/notes-desktop",
        telemetry: { fallbackUsed: false, modelAttempts: [] }
      }
    ]]) as never;

    let capturedPrompt = "";
    runner.startTask = async (prompt) => {
      capturedPrompt = prompt;
      return { id: "task-2", prompt };
    };

    const restarted = await runner.restartTask("task-1", "retry");

    assert.equal(restarted.id, "task-2");
    assert.match(capturedPrompt, /Build a desktop notes app\./);
    assert.match(capturedPrompt, /generated-apps\/notes-desktop/);
  });
});

test("AgentTaskRunner clean-retries by restoring the rollback snapshot first", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      tasks: Map<string, {
        id: string;
        prompt: string;
        status: "failed" | "stopped" | "completed" | "running";
        createdAt: string;
        updatedAt: string;
        summary: string;
        steps: unknown[];
        rollbackSnapshotId?: string;
        telemetry: { fallbackUsed: boolean; modelAttempts: unknown[] };
      }>;
      restartTask: (taskId: string, mode: "retry" | "retry-clean" | "continue-fix") => Promise<{ id: string; prompt: string }>;
      startTask: (prompt: string) => Promise<{ id: string; prompt: string }>;
      restoreSnapshot: (snapshotId: string) => Promise<{ ok: boolean; message: string }>;
    };

    const now = new Date().toISOString();
    runner.tasks = new Map([[
      "task-1",
      {
        id: "task-1",
        prompt: "Build a warehouse tool.",
        status: "failed",
        createdAt: now,
        updatedAt: now,
        summary: "Verification failed.",
        steps: [],
        rollbackSnapshotId: "snapshot-before",
        telemetry: { fallbackUsed: false, modelAttempts: [] }
      }
    ]]) as never;

    const calls: string[] = [];
    runner.restoreSnapshot = async (snapshotId) => {
      calls.push(`restore:${snapshotId}`);
      return { ok: true, message: "restored" };
    };
    runner.startTask = async (prompt) => {
      calls.push(`start:${prompt}`);
      return { id: "task-2", prompt };
    };

    await runner.restartTask("task-1", "retry-clean");

    assert.equal(calls[0], "restore:snapshot-before");
    assert.match(calls[1] ?? "", /^start:/);
    assert.match(calls[1] ?? "", /clean retry/i);
  });
});

test("AgentTaskRunner continue-fix prompts include prior failure context", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      tasks: Map<string, {
        id: string;
        prompt: string;
        status: "failed" | "stopped" | "completed" | "running";
        createdAt: string;
        updatedAt: string;
        summary: string;
        steps: unknown[];
        targetPath?: string;
        verification?: {
          checks: Array<{ status: "passed" | "failed" | "skipped"; label: string; details: string }>;
        };
        telemetry: { fallbackUsed: boolean; modelAttempts: unknown[] };
      }>;
      restartTask: (taskId: string, mode: "retry" | "retry-clean" | "continue-fix") => Promise<{ id: string; prompt: string }>;
      startTask: (prompt: string) => Promise<{ id: string; prompt: string }>;
    };

    const now = new Date().toISOString();
    runner.tasks = new Map([[
      "task-1",
      {
        id: "task-1",
        prompt: "Build a YouTube summarizer desktop app.",
        status: "failed",
        createdAt: now,
        updatedAt: now,
        summary: "Windows packaging failed.",
        steps: [],
        targetPath: "generated-apps/youtube-video-summarizer-pro",
        verification: {
          checks: [
            { status: "failed", label: "Packaging", details: "Windows installer packaging failed." }
          ]
        },
        telemetry: { fallbackUsed: false, modelAttempts: [] }
      }
    ]]) as never;

    let capturedPrompt = "";
    runner.startTask = async (prompt) => {
      capturedPrompt = prompt;
      return { id: "task-2", prompt };
    };

    await runner.restartTask("task-1", "continue-fix");

    assert.match(capturedPrompt, /Continue fixing the existing task output/i);
    assert.match(capturedPrompt, /generated-apps\/youtube-video-summarizer-pro/);
    assert.match(capturedPrompt, /Windows packaging failed\./);
    assert.match(capturedPrompt, /Verification failures to fix/i);
  });
});

test("AgentTaskRunner classifies desktop packages ahead of web workspace defaults", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      classifyArtifactType: (
        prompt: string,
        plan?: { workspaceKind?: "static" | "react" | "generic" } | null,
        verification?: { previewReady?: boolean } | null,
        packageManifest?: {
          name?: string;
          scripts?: Record<string, string>;
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        } | null
      ) => string;
    };

    const artifact = runner.classifyArtifactType(
      "build a better desktop shell",
      { workspaceKind: "react" },
      null,
      {
        name: "cipher-workspace",
        scripts: { start: "node scripts/launch-electron.mjs" },
        devDependencies: { electron: "^35.0.0" }
      }
    );

    assert.equal(artifact, "desktop-app");
  });
});

test("AgentTaskRunner keeps explicit script-tool prompts ahead of desktop workspace packages", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      classifyArtifactType: (
        prompt: string,
        plan?: { workspaceKind?: "static" | "react" | "generic" } | null,
        verification?: { previewReady?: boolean } | null,
        packageManifest?: {
          name?: string;
          scripts?: Record<string, string>;
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
          bin?: string | Record<string, string>;
        } | null
      ) => string;
    };

    const artifact = runner.classifyArtifactType(
      "[SOAK:tool.markdown-cli] Create a command-line tool that reads a markdown file and prints a compact section summary to the terminal.",
      { workspaceKind: "generic" },
      null,
      {
        name: "cipher-workspace",
        scripts: { start: "node scripts/launch-electron.mjs" },
        devDependencies: { electron: "^35.0.0" }
      }
    );

    assert.equal(artifact, "script-tool");
  });
});

test("AgentTaskRunner treats pricing page prompts as web apps ahead of the host desktop package", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      classifyArtifactType: (
        prompt: string,
        plan?: { workspaceKind?: "static" | "react" | "generic" } | null,
        verification?: { previewReady?: boolean } | null,
        packageManifest?: {
          name?: string;
          scripts?: Record<string, string>;
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        } | null
      ) => string;
      detectBuilderMode: (prompt: string) => "notes" | "landing" | "dashboard" | "crud" | "kanban" | null;
      extractPromptRequirements: (
        prompt: string
      ) => Array<{ id: string; label: string; terms: string[]; mode: "all" | "any" }>;
      resolveWorkspaceKindForPrompt: (
        prompt: string,
        detectedKind: "static" | "react" | "generic",
        requestedPaths: string[]
      ) => "static" | "react" | "generic";
      looksLikeNewProjectPrompt: (prompt: string) => boolean;
      buildBootstrapPlanForTarget: (
        prompt: string,
        targetDirectory: string
      ) => { template: "static" | "react-vite" | "nextjs" | "node-package" };
      detectBootstrapPlan: (
        prompt: string,
        inspection: { packageName?: string }
      ) => { template: string; targetDirectory: string } | null;
    };

    assert.equal(
      runner.detectBuilderMode("[SOAK:landing.saas-pricing] Build a static SaaS pricing page with tier cards and a start-trial CTA."),
      "landing"
    );
    assert.equal(
      runner.resolveWorkspaceKindForPrompt(
        "[SOAK:landing.saas-pricing] Build a static SaaS pricing page with tier cards and a start-trial CTA.",
        "generic",
        []
      ),
      "static"
    );
    assert.equal(
      runner.looksLikeNewProjectPrompt(
        "[SOAK:landing.saas-pricing] build a static saas pricing page with tier cards and a start-trial cta."
      ),
      true
    );
    assert.equal(
      runner.detectBuilderMode(
        "[SOAK:messy.outreach-tracker] Build me something tiny where I can keep track of people I need to follow up with, change their status, update next contact date, and still see the saved list after I add a few."
      ),
      "crud"
    );
    assert.equal(
      runner.detectBuilderMode(
        "[SOAK:messy.ops-wallboard] Make a React wallboard for operations delays with a few KPI cards, a filter or two, recent incidents, and a quick escalation summary."
      ),
      "dashboard"
    );
    assert.equal(
      runner.detectBuilderMode(
        "Build a small internal tool for tracking vendor payments. I need a table of vendors, payment status, due dates, and a quick way to mark one paid."
      ),
      "crud"
    );
    assert.equal(
      runner.detectBuilderMode(
        "[SOAK:manual.field-service-visits] Create a tiny web app for tracking field service visits. I need a form to add a visit, a visible list of saved visits, status updates, and a quick filter by technician."
      ),
      "crud"
    );
    assert.equal(
      runner.detectBuilderMode(
        "[SOAK:messy.supplier-disputes-console] Create a compact admin console for supplier disputes with a saved dispute list, assignment changes, resolution status, and a quick filter by team."
      ),
      "crud"
    );
    assert.equal(
      runner.looksLikeNewProjectPrompt(
        "[SOAK:messy.outreach-tracker] build me something tiny where i can keep track of people i need to follow up with, change their status, update next contact date, and still see the saved list after i add a few."
      ),
      true
    );
    assert.equal(
      runner.looksLikeNewProjectPrompt(
        "[SOAK:messy.supplier-disputes-console] create a compact admin console for supplier disputes with a saved dispute list, assignment changes, resolution status, and a quick filter by team."
      ),
      true
    );
    assert.equal(
      runner.looksLikeNewProjectPrompt(
        "[SOAK:messy.csv-glance-cli] give me a command line tool i can point at a csv file so it prints a quick glance summary like row count, columns, and header names."
      ),
      true
    );
    assert.equal(
      runner.looksLikeNewProjectPrompt(
        "[SOAK:messy.snippet-desk] i want a desktop workspace for saving useful snippets during support calls. give me a sidebar, a main list, tags or filters, and an obvious add action."
      ),
      true
    );
    assert.equal(
      runner.extractPromptRequirements(
        "[SOAK:messy.outreach-tracker] Build me something tiny where I can keep track of people I need to follow up with, change their status, update next contact date, and still see the saved list after I add a few."
      ).some((item) => item.id === "req-contact"),
      false
    );
    assert.equal(
      runner.buildBootstrapPlanForTarget(
        "[SOAK:messy.outreach-tracker] Build me something tiny where I can keep track of people I need to follow up with, change their status, update next contact date, and still see the saved list after I add a few.",
        "generated-apps/soak-messy-outreach-tracker"
      ).template,
      "react-vite"
    );
    assert.equal(
      runner.buildBootstrapPlanForTarget(
        "[SOAK:landing.saas-pricing] Build a static SaaS pricing page with tier cards and a start-trial CTA.",
        "generated-apps/soak-landing-saas-pricing"
      ).template,
      "static"
    );
    assert.equal(
      runner.buildBootstrapPlanForTarget(
        "[SOAK:messy.supplier-disputes-console] Create a compact admin console for supplier disputes with a saved dispute list, assignment changes, resolution status, and a quick filter by team.",
        "generated-apps/soak-messy-supplier-disputes-console"
      ).template,
      "react-vite"
    );
    assert.equal(
      runner.detectBootstrapPlan(
        "[SOAK:messy.csv-glance-cli] Give me a command line tool I can point at a CSV file so it prints a quick glance summary like row count, columns, and header names.",
        { packageName: "cipher-ai" }
      )?.template,
      "node-package"
    );

    const artifact = runner.classifyArtifactType(
      "[SOAK:landing.saas-pricing] Build a static SaaS pricing page with tier cards and a start-trial CTA.",
      { workspaceKind: "static" },
      null,
      {
        name: "cipher-workspace",
        scripts: { start: "node scripts/launch-electron.mjs" },
        devDependencies: { electron: "^35.0.0" }
      }
    );

    assert.equal(artifact, "web-app");
    assert.equal(
      runner.classifyArtifactType(
        "Build a small internal tool for tracking vendor payments. I need a table of vendors, payment status, due dates, and a quick way to mark one paid.",
        { workspaceKind: "generic" },
        null,
        null
      ),
      "web-app"
    );
  });
});

test("AgentTaskRunner treats utility package prompts as libraries before generic tool matches", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      classifyArtifactType: (
        prompt: string,
        plan?: { workspaceKind?: "static" | "react" | "generic" } | null,
        verification?: { previewReady?: boolean } | null,
        packageManifest?: {
          name?: string;
          scripts?: Record<string, string>;
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        } | null
      ) => string;
    };

    const artifact = runner.classifyArtifactType(
      "[SOAK:library.date-utils] Create a small reusable TypeScript date utility package with formatting and relative-time helpers.",
      { workspaceKind: "generic" },
      null,
      {
        name: "date-utils",
        scripts: { build: "node -e \"console.log('Package ready')\"" }
      }
    );

    assert.equal(artifact, "library");
  });
});

test("AgentTaskRunner provides a heuristic desktop workspace fallback for snippet-manager prompts", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      buildHeuristicDesktopWorkspace: (
        prompt: string,
        plan: { workspaceKind: "static" | "react" | "generic"; workingDirectory: string }
      ) => { summary: string; edits: Array<{ path: string; content: string }> } | null;
    };

    const result = runner.buildHeuristicDesktopWorkspace(
      "[SOAK:desktop.snippet-manager] Create a desktop snippet manager workspace with a sidebar, snippet list, tag filters, and a clear create-snippet action.",
      {
        workspaceKind: "react",
        workingDirectory: "generated-apps/soak-desktop-snippet-manager"
      }
    );

    assert.ok(result);
    assert.match(result.summary, /desktop workspace/i);
    assert.ok(result.edits.some((edit) => edit.path.endsWith("src/App.tsx") && edit.content.includes("Create snippet")));
    assert.ok(result.edits.some((edit) => edit.path.endsWith("src/App.css") && edit.content.includes(".desktop-shell")));
    assert.ok(result.edits.some((edit) => edit.path.endsWith("src/index.css") && edit.content.includes(":root")));
  });
});

test("AgentTaskRunner prefers heuristic-first implementation only for supported desktop heuristic prompts", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      shouldPreferHeuristicImplementation: (
        prompt: string,
        plan: {
          workspaceKind: "static" | "react" | "generic";
          builderMode: "notes" | "landing" | "dashboard" | "crud" | "kanban" | null;
        }
      ) => boolean;
    };

    assert.equal(
      runner.shouldPreferHeuristicImplementation(
        "[SOAK:realworld.helpdesk-desktop-shell] Create a desktop helpdesk workspace with a sidebar, ticket queue, priority filters, and a clear new-ticket action.",
        { workspaceKind: "react", builderMode: null }
      ),
      false
    );
    assert.equal(
      runner.shouldPreferHeuristicImplementation(
        "Build a desktop markdown editor with tabs, file persistence, and split view editing.",
        { workspaceKind: "react", builderMode: null }
      ),
      false
    );
    assert.equal(
      runner.shouldPreferHeuristicImplementation(
        "[SOAK:windows.file-renamer] Create a standalone Windows desktop file renamer with a folder picker, filename preview list, replace-text inputs, and a clear rename action.",
        { workspaceKind: "react", builderMode: null }
      ),
      true
    );
    assert.equal(
      runner.shouldPreferHeuristicImplementation(
        "[SOAK:windows.pdf-combiner] Create a Windows desktop PDF combiner utility with a file list, move-up and move-down controls, a merge button, and a visible output path field.",
        { workspaceKind: "react", builderMode: null }
      ),
      true
    );
    assert.equal(
      runner.shouldPreferHeuristicImplementation(
        "Build a standalone Windows desktop shop record software for a small store. I want to enter only daily records, and the app should automatically generate summary views for daily, weekly, monthly, quarterly, and yearly performance. Include a clear daily entry form, a saved records list, totals, and report sections that update from those entries.",
        { workspaceKind: "react", builderMode: null }
      ),
      true
    );
  });
});

test("AgentTaskRunner snapshots ignore staged desktop packaging artifacts like app.asar", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      createSnapshot: (label: string, taskId?: string, options?: { kind?: string; targetPathHint?: string }) => Promise<{ id: string }>;
    };

    await mkdir(join(workspaceRoot, "release-stage", "win-unpacked", "resources"), { recursive: true });
    await writeFile(join(workspaceRoot, "release-stage", "win-unpacked", "resources", "app.asar"), "fake-asar", "utf8");
    await writeFile(join(workspaceRoot, "README.md"), "# snapshot ok\n", "utf8");

    const snapshot = await runner.createSnapshot("Before packaging");
    const snapshotRoot = join(workspaceRoot, ".cipher-snapshots", snapshot.id, "files");

    assert.equal(await readFile(join(snapshotRoot, "README.md"), "utf8"), "# snapshot ok\n");
    await assert.rejects(
      () => readFile(join(snapshotRoot, "release-stage", "win-unpacked", "resources", "app.asar"), "utf8"),
      /ENOENT/
    );
  });
});

test("AgentTaskRunner snapshots ignore alternate generated packaging output folders like release-package", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      createSnapshot: (label: string, taskId?: string, options?: { kind?: string; targetPathHint?: string }) => Promise<{ id: string }>;
    };

    await mkdir(join(workspaceRoot, "release-package", "win-unpacked", "resources"), { recursive: true });
    await writeFile(join(workspaceRoot, "release-package", "win-unpacked", "resources", "app.asar"), "fake-asar", "utf8");
    await writeFile(join(workspaceRoot, "README.md"), "# snapshot ok\n", "utf8");

    const snapshot = await runner.createSnapshot("Before packaging");
    const snapshotRoot = join(workspaceRoot, ".cipher-snapshots", snapshot.id, "files");

    assert.equal(await readFile(join(snapshotRoot, "README.md"), "utf8"), "# snapshot ok\n");
    await assert.rejects(
      () => readFile(join(snapshotRoot, "release-package", "win-unpacked", "resources", "app.asar"), "utf8"),
      /ENOENT/
    );
  });
});

test("AgentTaskRunner snapshots ignore ComfyUI runtime assets", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      createSnapshot: (label: string, taskId?: string, options?: { kind?: string; targetPathHint?: string }) => Promise<{ id: string }>;
    };

    await mkdir(join(workspaceRoot, "models", "comfyui", "checkpoints"), { recursive: true });
    await writeFile(join(workspaceRoot, "models", "comfyui", "checkpoints", "sd_xl_base_1.0.safetensors"), "fake-model", "utf8");
    await writeFile(join(workspaceRoot, "README.md"), "# snapshot ok\n", "utf8");

    const snapshot = await runner.createSnapshot("Before agent task");
    const snapshotRoot = join(workspaceRoot, ".cipher-snapshots", snapshot.id, "files");

    assert.equal(await readFile(join(snapshotRoot, "README.md"), "utf8"), "# snapshot ok\n");
    await assert.rejects(
      () => readFile(join(snapshotRoot, "models", "comfyui", "checkpoints", "sd_xl_base_1.0.safetensors"), "utf8"),
      /ENOENT/
    );
  });
});

test("AgentTaskRunner restores snapshots without touching ComfyUI runtime assets", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot);

    await mkdir(join(workspaceRoot, "models", "comfyui", "checkpoints"), { recursive: true });
    await writeFile(join(workspaceRoot, "models", "comfyui", "checkpoints", "sd_xl_base_1.0.safetensors"), "original-model", "utf8");
    await writeFile(join(workspaceRoot, "README.md"), "# before\n", "utf8");

    const snapshot = await (runner as never as {
      createSnapshot: (label: string, taskId?: string, options?: { kind?: string; targetPathHint?: string }) => Promise<{ id: string }>;
    }).createSnapshot("Before agent task");

    await writeFile(join(workspaceRoot, "models", "comfyui", "checkpoints", "sd_xl_base_1.0.safetensors"), "updated-model", "utf8");
    await writeFile(join(workspaceRoot, "README.md"), "# after\n", "utf8");

    const restored = await runner.restoreSnapshot(snapshot.id);

    assert.equal(restored.ok, true);
    assert.equal(await readFile(join(workspaceRoot, "README.md"), "utf8"), "# before\n");
    assert.equal(
      await readFile(join(workspaceRoot, "models", "comfyui", "checkpoints", "sd_xl_base_1.0.safetensors"), "utf8"),
      "updated-model"
    );
  });
});

test("AgentTaskRunner restores task snapshots without deleting unrelated repo additions", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot);

    await mkdir(join(workspaceRoot, ".github", "workflows"), { recursive: true });
    await writeFile(join(workspaceRoot, ".github", "workflows", "desktop-smoke.yml"), "name: keep-me\n", "utf8");

    const snapshot = await (runner as never as {
      createSnapshot: (label: string, taskId?: string, options?: { kind?: string; targetPathHint?: string }) => Promise<{ id: string }>;
    }).createSnapshot("Before task", "task-1", {
      kind: "before-task",
      targetPathHint: "generated-apps/demo-app"
    });

    await mkdir(join(workspaceRoot, "generated-apps", "demo-app"), { recursive: true });
    await writeFile(join(workspaceRoot, "generated-apps", "demo-app", "package.json"), "{\"name\":\"demo-app\"}\n", "utf8");

    const restored = await runner.restoreSnapshot(snapshot.id);

    assert.equal(restored.ok, true);
    assert.equal(await readFile(join(workspaceRoot, ".github", "workflows", "desktop-smoke.yml"), "utf8"), "name: keep-me\n");
    await assert.rejects(
      () => readFile(join(workspaceRoot, "generated-apps", "demo-app", "package.json"), "utf8"),
      /ENOENT/
    );
  });
});

test("AgentTaskRunner restores scoped task targets back to their snapshotted contents", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot);

    await mkdir(join(workspaceRoot, "generated-apps", "demo-app"), { recursive: true });
    await writeFile(join(workspaceRoot, "generated-apps", "demo-app", "package.json"), "{\"name\":\"before\"}\n", "utf8");

    const snapshot = await (runner as never as {
      createSnapshot: (label: string, taskId?: string, options?: { kind?: string; targetPathHint?: string }) => Promise<{ id: string }>;
    }).createSnapshot("Before task", "task-1", {
      kind: "before-task",
      targetPathHint: "generated-apps/demo-app"
    });

    await writeFile(join(workspaceRoot, "generated-apps", "demo-app", "package.json"), "{\"name\":\"after\"}\n", "utf8");
    await writeFile(join(workspaceRoot, "generated-apps", "demo-app", "README.md"), "# changed\n", "utf8");
    await mkdir(join(workspaceRoot, ".github", "workflows"), { recursive: true });
    await writeFile(join(workspaceRoot, ".github", "workflows", "desktop-smoke.yml"), "name: keep-me\n", "utf8");

    const restored = await runner.restoreSnapshot(snapshot.id);

    assert.equal(restored.ok, true);
    assert.equal(await readFile(join(workspaceRoot, "generated-apps", "demo-app", "package.json"), "utf8"), "{\"name\":\"before\"}\n");
    await assert.rejects(
      () => readFile(join(workspaceRoot, "generated-apps", "demo-app", "README.md"), "utf8"),
      /ENOENT/
    );
    assert.equal(await readFile(join(workspaceRoot, ".github", "workflows", "desktop-smoke.yml"), "utf8"), "name: keep-me\n");
  });
});

test("AgentTaskRunner prunes stale unreferenced automatic snapshots before creating a new one", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      tasks: Map<string, { rollbackSnapshotId?: string; completionSnapshotId?: string }>;
      createSnapshot: (label: string, taskId?: string, options?: { kind?: string; targetPathHint?: string }) => Promise<{ id: string }>;
      listSnapshots: () => Promise<Array<{ id: string }>>;
    };

    const snapshotRoot = join(workspaceRoot, ".cipher-snapshots");
    await mkdir(snapshotRoot, { recursive: true });
    await writeFile(join(workspaceRoot, "README.md"), "# snapshot ok\n", "utf8");

    const createMeta = async (id: string, createdAt: string, kind: "before-task" | "after-task" | "manual") => {
      const dir = join(snapshotRoot, id);
      await mkdir(join(dir, "files"), { recursive: true });
      await writeFile(join(dir, "meta.json"), JSON.stringify({
        id,
        createdAt,
        label: id,
        workspaceRoot,
        fileCount: 0,
        kind
      }, null, 2), "utf8");
    };

    const now = Date.now();
    for (let index = 0; index < 30; index += 1) {
      await createMeta(`snapshot-auto-${index}`, new Date(now - (index * 60_000)).toISOString(), "before-task");
    }
    await createMeta("snapshot-ref", new Date(now - (31 * 60_000)).toISOString(), "before-task");
    await createMeta("snapshot-manual", new Date(now - (32 * 60_000)).toISOString(), "manual");
    await mkdir(join(snapshotRoot, "snapshot-broken", "files"), { recursive: true });

    runner.tasks = new Map([[
      "task-1",
      {
        rollbackSnapshotId: "snapshot-ref"
      }
    ]]) as never;

    await runner.createSnapshot("Before task");

    const snapshotIds = (await runner.listSnapshots()).map((snapshot) => snapshot.id);
    assert.equal(snapshotIds.includes("snapshot-ref"), true);
    assert.equal(snapshotIds.includes("snapshot-manual"), true);
    assert.equal(snapshotIds.includes("snapshot-auto-0"), true);
    assert.equal(snapshotIds.includes("snapshot-auto-23"), true);
    assert.equal(snapshotIds.includes("snapshot-auto-24"), false);
    assert.equal(snapshotIds.includes("snapshot-auto-29"), false);

    const snapshotDirs = await readdir(snapshotRoot, { withFileTypes: true });
    assert.equal(snapshotDirs.some((entry) => entry.isDirectory() && entry.name === "snapshot-broken"), false);
  });
});

test("AgentTaskRunner cleans partial snapshot directories and reports ENOSPC clearly", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      createSnapshot: (label: string, taskId?: string, options?: { kind?: string; targetPathHint?: string }) => Promise<{ id: string }>;
      copyWorkspaceSnapshot: () => Promise<number>;
    };

    await writeFile(join(workspaceRoot, "README.md"), "# snapshot ok\n", "utf8");
    runner.copyWorkspaceSnapshot = async () => {
      const error = new Error("ENOSPC: no space left on device");
      (error as Error & { code?: string }).code = "ENOSPC";
      throw error;
    };

    await assert.rejects(
      () => runner.createSnapshot("Before task"),
      /No space left while creating a workspace snapshot/i
    );

    const snapshotRoot = join(workspaceRoot, ".cipher-snapshots");
    const remainingDirectories = (await readdir(snapshotRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    assert.deepEqual(remainingDirectories, []);
  });
});

test("AgentTaskRunner prefers heuristic-first implementation for simple generated package prompts", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      shouldPreferHeuristicImplementation: (
        prompt: string,
        plan: {
          workspaceKind: "static" | "react" | "generic";
          builderMode: "notes" | "landing" | "dashboard" | "crud" | "kanban" | null;
          workingDirectory: string;
        }
      ) => boolean;
    };

    assert.equal(
      runner.shouldPreferHeuristicImplementation(
        "[SOAK:manual.fulfillment-api] Build a tiny backend for fulfillment steps with endpoints to list orders, create one, mark packed, and mark shipped.",
        { workspaceKind: "generic", builderMode: null, workingDirectory: "generated-apps/soak-manual-fulfillment-api" }
      ),
      true
    );
    assert.equal(
      runner.shouldPreferHeuristicImplementation(
        "[SOAK:manual.csv-ticket-summary] Create a small command-line tool that reads a CSV file of support tickets and prints a short status summary grouped by priority.",
        { workspaceKind: "generic", builderMode: null, workingDirectory: "generated-apps/soak-manual-csv-ticket-summary" }
      ),
      true
    );
    assert.equal(
      runner.shouldPreferHeuristicImplementation(
        "[SOAK:manual.refunds-math-library] Create a small reusable JavaScript package for refunds math with helpers for subtotal, fees, tax, refund amount, and net payout.",
        { workspaceKind: "generic", builderMode: null, workingDirectory: "generated-apps/soak-manual-refunds-math-library" }
      ),
      true
    );
    assert.equal(
      runner.shouldPreferHeuristicImplementation(
        "Build a reusable package that wraps a third-party billing SDK with typed clients, retries, and webhook verification.",
        { workspaceKind: "generic", builderMode: null, workingDirectory: "generated-apps/billing-sdk-wrapper" }
      ),
      false
    );
  });
});

test("AgentTaskRunner prefers heuristic-first implementation for generated notes prompts", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      shouldPreferHeuristicImplementation: (
        prompt: string,
        plan: {
          workspaceKind: "static" | "react" | "generic";
          builderMode: "notes" | "landing" | "dashboard" | "crud" | "kanban" | null;
          workingDirectory: string;
        }
      ) => boolean;
    };

    assert.equal(
      runner.shouldPreferHeuristicImplementation(
        "[SOAK:notes.daily-journal] Make a notes app for daily journal entries where I can add, edit, and save entries with visible saved state in the UI.",
        { workspaceKind: "react", builderMode: "notes", workingDirectory: "generated-apps/soak-notes-daily-journal" }
      ),
      true
    );
  });
});

test("AgentTaskRunner treats desktop snippet-desk prompts as generated desktop projects instead of host workspace edits", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      classifyArtifactType: (
        prompt: string,
        plan?: { workspaceKind?: "static" | "react" | "generic" } | null,
        verification?: { previewReady?: boolean } | null,
        packageManifest?: {
          name?: string;
          scripts?: Record<string, string>;
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        } | null
      ) => string;
      looksLikeNewProjectPrompt: (prompt: string) => boolean;
      detectBootstrapPlan: (
        prompt: string,
        inspection: { packageName?: string }
      ) => { template: string; targetDirectory: string } | null;
    };

    const prompt = "Create a desktop snippet desk for support work. Give me a sidebar, categories, a main snippet list, and a clear add snippet action.";

    assert.equal(runner.classifyArtifactType(prompt, { workspaceKind: "generic" }, null, null), "desktop-app");
    assert.equal(runner.looksLikeNewProjectPrompt(prompt.toLowerCase()), true);

    const plan = runner.detectBootstrapPlan(prompt, { packageName: "cipher-workspace" });

    assert.equal(plan?.template, "react-vite");
    assert.match(plan?.targetDirectory ?? "", /^generated-apps\//);
  });
});

test("AgentTaskRunner classifies standalone Windows calculator prompts as desktop apps", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      classifyArtifactType: (
        prompt: string,
        plan?: { workspaceKind?: "static" | "react" | "generic" } | null,
        verification?: { previewReady?: boolean } | null,
        packageManifest?: {
          name?: string;
          scripts?: Record<string, string>;
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        } | null
      ) => string;
      detectBootstrapPlan: (
        prompt: string,
        inspection: { packageName?: string }
      ) => { template: string; targetDirectory: string } | null;
    };

    const prompt = "Build a standalone Windows desktop calculator app, not a web page. It should open as its own desktop window and include a calculator display, number pad, addition, subtraction, multiplication, division, equals, and clear.";

    assert.equal(runner.classifyArtifactType(prompt, { workspaceKind: "generic" }, null, null), "desktop-app");

    const plan = runner.detectBootstrapPlan(prompt, { packageName: "cipher-workspace" });

    assert.equal(plan?.template, "react-vite");
    assert.match(plan?.targetDirectory ?? "", /^generated-apps\//);
  });
});

test("AgentTaskRunner treats Windows software prompts as desktop apps without requiring the exact phrase desktop app", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      classifyArtifactType: (
        prompt: string,
        plan?: { workspaceKind?: "static" | "react" | "generic" } | null,
        verification?: { previewReady?: boolean } | null,
        packageManifest?: {
          name?: string;
          scripts?: Record<string, string>;
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        } | null
      ) => string;
    };

    const prompt = "Create a Windows calculator software with an installable standalone window, number pad, operator buttons, equals, and clear.";

    assert.equal(runner.classifyArtifactType(prompt, { workspaceKind: "generic" }, null, null), "desktop-app");
  });
});

test("AgentTaskRunner prefers the desktop heuristic over the notes heuristic for desktop voice-note prompts", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      tryHeuristicImplementation: (
        taskId: string,
        prompt: string,
        plan: {
          workspaceKind: "static" | "react" | "generic";
          workingDirectory: string;
        }
      ) => Promise<{ summary: string; edits: Array<{ path: string; content: string }> } | null>;
    };

    const result = await runner.tryHeuristicImplementation(
      "task-1",
      "[SOAK:desktop.voice-notes] Create a desktop voice-notes workspace with a sidebar, recording list, and a clear start recording action.",
      {
        workspaceKind: "react",
        workingDirectory: "generated-apps/soak-desktop-voice-notes"
      }
    );

    assert.ok(result);
    assert.match(result.summary, /desktop workspace/i);
    assert.ok(result.edits.some((edit) => edit.path.endsWith("src/App.tsx") && edit.content.includes("Start recording")));
  });
});

test("AgentTaskRunner provides a heuristic desktop file-renamer workspace", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      buildHeuristicDesktopWorkspace: (
        prompt: string,
        plan: { workspaceKind: "static" | "react" | "generic"; workingDirectory: string }
      ) => { summary: string; edits: Array<{ path: string; content: string }> } | null;
    };

    const result = runner.buildHeuristicDesktopWorkspace(
      "[SOAK:windows.file-renamer] Create a standalone Windows desktop file renamer with a folder picker, filename preview list, replace-text inputs, and a clear rename action.",
      {
        workspaceKind: "react",
        workingDirectory: "generated-apps/soak-windows-file-renamer"
      }
    );

    assert.ok(result);
    assert.match(result.summary, /desktop workspace/i);
    assert.ok(result.edits.some((edit) => edit.path.endsWith("src/App.tsx") && edit.content.includes("Rename files")));
    assert.ok(result.edits.some((edit) => edit.path.endsWith("src/App.tsx") && edit.content.includes("Filename preview")));
    assert.ok(result.edits.some((edit) => edit.path.endsWith("src/App.tsx") && edit.content.includes("handlePickFolder")));
    assert.ok(result.edits.some((edit) => edit.path.endsWith("src/App.css") && edit.content.includes(".desktop-field")));
  });
});

test("AgentTaskRunner provides a heuristic desktop PDF-combiner workspace", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      buildHeuristicDesktopWorkspace: (
        prompt: string,
        plan: { workspaceKind: "static" | "react" | "generic"; workingDirectory: string }
      ) => { summary: string; edits: Array<{ path: string; content: string }> } | null;
    };

    const result = runner.buildHeuristicDesktopWorkspace(
      "[SOAK:windows.pdf-combiner] Create a Windows desktop PDF combiner utility with a file list, move-up and move-down controls, a merge button, and a visible output path field.",
      {
        workspaceKind: "react",
        workingDirectory: "generated-apps/soak-windows-pdf-combiner"
      }
    );

    assert.ok(result);
    assert.match(result.summary, /desktop workspace/i);
    assert.ok(result.edits.some((edit) => edit.path.endsWith("src/App.tsx") && edit.content.includes("Merge PDFs")));
    assert.ok(result.edits.some((edit) => edit.path.endsWith("src/App.tsx") && edit.content.includes("Move up")));
    assert.ok(result.edits.some((edit) => edit.path.endsWith("src/App.tsx") && edit.content.includes("Output file")));
  });
});

test("AgentTaskRunner provides a heuristic desktop business reporting workspace", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      buildHeuristicDesktopWorkspace: (
        prompt: string,
        plan: { workspaceKind: "static" | "react" | "generic"; workingDirectory: string }
      ) => { summary: string; edits: Array<{ path: string; content: string }> } | null;
    };

    const result = runner.buildHeuristicDesktopWorkspace(
      "Build a standalone Windows desktop shop record software for a small store. I want to enter only daily records, and the app should automatically generate summary views for daily, weekly, monthly, quarterly, and yearly performance. Include a clear daily entry form, a saved records list, totals, and report sections that update from those entries.",
      {
        workspaceKind: "react",
        workingDirectory: "generated-apps/soak-windows-shop-records"
      }
    );

    assert.ok(result);
    assert.match(result.summary, /desktop workspace/i);
    assert.ok(result.edits.some((edit) => edit.path.endsWith("src/App.tsx") && edit.content.includes("Save daily entry")));
    assert.ok(result.edits.some((edit) => edit.path.endsWith("src/App.tsx") && edit.content.includes("Saved records")));
    assert.ok(result.edits.some((edit) => edit.path.endsWith("src/App.tsx") && edit.content.includes("Weekly report")));
    assert.ok(result.edits.some((edit) => edit.path.endsWith("src/App.tsx") && edit.content.includes("Quarterly report")));
    assert.ok(result.edits.some((edit) => edit.path.endsWith("src/App.css") && edit.content.includes(".desktop-report-grid")));
  });
});

test("AgentTaskRunner prefers the notes heuristic over the generic desktop workspace for desktop notes prompts", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      tryHeuristicImplementation: (
        taskId: string,
        prompt: string,
        plan: {
          workspaceKind: "static" | "react" | "generic";
          workingDirectory: string;
          builderMode: "notes" | "landing" | "dashboard" | "crud" | "kanban" | null;
        }
      ) => Promise<{ summary: string; edits: Array<{ path: string; content: string }> } | null>;
    };

    const result = await runner.tryHeuristicImplementation(
      "task-1",
      "Build a standalone Windows desktop notes app with a clean window, a title field, a large notes editor, a save button, and a small saved-notes list.",
      {
        workspaceKind: "react",
        workingDirectory: "generated-apps/desktop-notes",
        builderMode: "notes"
      }
    );

    assert.ok(result);
    assert.match(result.summary, /react notes app/i);
    assert.ok(result.edits.some((edit) => edit.path.endsWith("src/App.tsx") && edit.content.includes("Save note")));
    assert.ok(result.edits.some((edit) => edit.path.endsWith("src/App.tsx") && edit.content.includes("<h2>Notes</h2>")));
  });
});

test("AgentTaskRunner omits host workspace dot targets from completed task summaries", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      buildCompletedTaskSummary: (task: {
        artifactType?: string;
        targetPath?: string;
        verification?: { summary?: string } | null;
      }) => string;
    };

    const summary = runner.buildCompletedTaskSummary({
      artifactType: "desktop-app",
      targetPath: ".",
      verification: { summary: "App build and start passed." }
    });

    assert.equal(summary, "Completed desktop app. Verification: App build and start passed..");
  });
});

test("AgentTaskRunner provides a heuristic API service fallback for invoice-service prompts", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      buildHeuristicApiService: (
        prompt: string,
        plan: { workspaceKind: "static" | "react" | "generic"; workingDirectory: string }
      ) => { summary: string; edits: Array<{ path: string; content: string }> } | null;
    };

    const result = runner.buildHeuristicApiService(
      "[SOAK:api.invoice-service] Build a small API service for invoice workflows with endpoints to list invoices, create an invoice, approve one, and mark one as paid.",
      {
        workspaceKind: "generic",
        workingDirectory: "generated-apps/soak-api-invoice-service"
      }
    );

    assert.ok(result);
    assert.match(result.summary, /API service/i);
    assert.ok(result.edits.some((edit) => edit.path.endsWith("package.json") && edit.content.includes('"start": "node src/server.js"')));
    assert.ok(result.edits.some((edit) => edit.path.endsWith("src/server.js") && edit.content.includes("/invoices")));
    assert.ok(result.edits.some((edit) => edit.path.endsWith("src/server.js") && edit.content.includes("/approve")));
    assert.ok(result.edits.every((edit) => !edit.content.includes("express@")));
  });
});

test("AgentTaskRunner provides a heuristic script-tool fallback for JSON audit prompts", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      buildHeuristicScriptTool: (
        prompt: string,
        plan: { workspaceKind: "static" | "react" | "generic"; workingDirectory: string }
      ) => { summary: string; edits: Array<{ path: string; content: string }> } | null;
    };

    const result = runner.buildHeuristicScriptTool(
      "[SOAK:realworld.json-audit-cli] Create a command-line tool that reads a JSON file and prints a compact audit summary.",
      {
        workspaceKind: "generic",
        workingDirectory: "generated-apps/soak-realworld-json-audit-cli"
      }
    );

    assert.ok(result);
    assert.match(result.summary, /JSON audit/i);
    assert.ok(result.edits.some((edit) => edit.path.endsWith("src/index.js") && edit.content.includes("JSON.parse")));
    assert.ok(result.edits.some((edit) => edit.path.endsWith("bin/cli.mjs")));
  });
});

test("AgentTaskRunner provides a heuristic CRUD fallback for follow-up tracker prompts", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      buildHeuristicCrudApp: (
        prompt: string,
        plan: { workspaceKind: "static" | "react" | "generic"; workingDirectory: string }
      ) => { summary: string; edits: Array<{ path: string; content: string }> } | null;
    };

    const result = runner.buildHeuristicCrudApp(
      "[SOAK:messy.outreach-tracker] Build me something tiny where I can keep track of people I need to follow up with, change their status, update next contact date, and still see the saved list after I add a few.",
      {
        workspaceKind: "react",
        workingDirectory: "generated-apps/soak-messy-outreach-tracker"
      }
    );

    assert.ok(result);
    assert.match(result.summary, /CRUD app/i);
    assert.ok(result.edits.some((edit) => edit.path.endsWith("src/App.tsx")));
  });
});

test("AgentTaskRunner provides a heuristic CRUD fallback for vendor-payments internal tool prompts", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      buildHeuristicCrudApp: (
        prompt: string,
        plan: { workspaceKind: "static" | "react" | "generic"; workingDirectory: string }
      ) => { summary: string; edits: Array<{ path: string; content: string }> } | null;
    };

    const result = runner.buildHeuristicCrudApp(
      "Build a small internal tool for tracking vendor payments. I need a table of vendors, payment status, due dates, and a quick way to mark one paid.",
      {
        workspaceKind: "react",
        workingDirectory: "generated-apps/vendor-payments"
      }
    );

    assert.ok(result);
    assert.match(result.summary, /crud app/i);
    assert.ok(result.edits.some((edit) => edit.path.endsWith("src/App.tsx") && edit.content.includes("Mark paid")));
  });
});

test("AgentTaskRunner keeps dashboard reminder prompts out of CRUD mode", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      detectBuilderMode: (prompt: string) => string | null;
    };

    const mode = runner.detectBuilderMode(
      "Build a small internal dashboard for unpaid invoices, recent collections, and follow-up reminders."
    );

    assert.equal(mode, "dashboard");
  });
});

test("AgentTaskRunner provides a heuristic dashboard fallback for wallboard prompts", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      buildHeuristicDashboard: (
        prompt: string,
        plan: { workspaceKind: "static" | "react" | "generic"; workingDirectory: string }
      ) => { summary: string; edits: Array<{ path: string; content: string }> } | null;
    };

    const result = runner.buildHeuristicDashboard(
      "[SOAK:messy.ops-wallboard] Make a React wallboard for operations delays with a few KPI cards, a filter or two, recent incidents, and a quick escalation summary.",
      {
        workspaceKind: "react",
        workingDirectory: "generated-apps/soak-messy-ops-wallboard"
      }
    );

    assert.ok(result);
    assert.match(result.summary, /dashboard/i);
    assert.ok(result.edits.some((edit) => edit.path.endsWith("src/App.tsx")));
  });
});

test("AgentTaskRunner heuristic script-tool fallback matches file-audit prompts during implementation retries", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      buildHeuristicScriptTool: (
        prompt: string,
        plan: { workspaceKind: "static" | "react" | "generic"; workingDirectory: string }
      ) => { summary: string; edits: Array<{ path: string; content: string }> } | null;
    };

    const result = runner.buildHeuristicScriptTool(
      "[SOAK:realworld.json-audit-cli] Create a compact audit summary for a JSON file.\nImplement requested changes.",
      {
        workspaceKind: "generic",
        workingDirectory: "generated-apps/soak-realworld-json-audit-cli"
      }
    );

    assert.ok(result);
    assert.match(result.summary, /JSON audit/i);
  });
});

test("AgentTaskRunner provides a heuristic library fallback for validation prompts", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      buildHeuristicLibrary: (
        prompt: string,
        plan: { workspaceKind: "static" | "react" | "generic"; workingDirectory: string }
      ) => { summary: string; edits: Array<{ path: string; content: string }> } | null;
    };

    const result = runner.buildHeuristicLibrary(
      "[SOAK:realworld.validation-library] Create a small reusable TypeScript validation library with email checks, required-string guards, min-length validation, and friendly error formatting helpers.",
      {
        workspaceKind: "generic",
        workingDirectory: "generated-apps/soak-realworld-validation-library"
      }
    );

    assert.ok(result);
    assert.match(result.summary, /validation library/i);
    assert.ok(result.edits.some((edit) => edit.path.endsWith("src/index.js") && edit.content.includes("export function isEmail")));
    assert.ok(result.edits.some((edit) => edit.path.endsWith("src/index.js") && edit.content.includes("formatErrors")));
  });
});

test("AgentTaskRunner provides a heuristic library fallback for formatting-helper prompts", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      buildHeuristicLibrary: (
        prompt: string,
        plan: { workspaceKind: "static" | "react" | "generic"; workingDirectory: string }
      ) => { summary: string; edits: Array<{ path: string; content: string }> } | null;
    };

    const result = runner.buildHeuristicLibrary(
      "[SOAK:manual.money-format-library] Create a tiny reusable JavaScript package that formats money amounts, percentage deltas, and compact counts for dashboards.",
      {
        workspaceKind: "generic",
        workingDirectory: "generated-apps/soak-manual-money-format-library"
      }
    );

    assert.ok(result);
    assert.match(result.summary, /formatting library/i);
    assert.ok(result.edits.some((edit) => edit.path.endsWith("src/index.js") && edit.content.includes("formatMoney")));
    assert.ok(result.edits.some((edit) => edit.path.endsWith("src/index.js") && edit.content.includes("formatPercentDelta")));
    assert.ok(result.edits.some((edit) => edit.path.endsWith("src/index.js") && edit.content.includes("formatCompactCount")));
  });
});

test("AgentTaskRunner does not attach dashboard UI requirements to library prompts that mention dashboards as a usage context", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      extractPromptRequirements: (
        prompt: string
      ) => Array<{ id: string; label: string; terms: string[]; mode: "all" | "any" }>;
      classifyArtifactType: (
        prompt: string,
        plan?: { workspaceKind?: "static" | "react" | "generic" } | null,
        verification?: { previewReady?: boolean } | null,
        packageManifest?: {
          name?: string;
          scripts?: Record<string, string>;
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        } | null
      ) => string;
    };

    const prompt = "Create a tiny reusable JavaScript package that formats money amounts, percentage deltas, and compact counts for dashboards.";
    const requirements = runner.extractPromptRequirements(prompt);

    assert.equal(runner.classifyArtifactType(prompt, { workspaceKind: "generic" }, null, null), "library");
    assert.equal(requirements.some((item) => item.id === "req-dashboard"), false);
  });
});

test("AgentTaskRunner attaches reporting requirements to desktop business record prompts", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      extractPromptRequirements: (
        prompt: string
      ) => Array<{ id: string; label: string; terms: string[]; mode: "all" | "any" }>;
      classifyArtifactType: (
        prompt: string,
        plan?: { workspaceKind?: "static" | "react" | "generic" } | null,
        verification?: { previewReady?: boolean } | null,
        packageManifest?: {
          name?: string;
          scripts?: Record<string, string>;
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        } | null
      ) => string;
    };

    const prompt = "Build a standalone Windows desktop shop record software for a small store. I want to enter only daily records, and the app should automatically generate summary views for daily, weekly, monthly, quarterly, and yearly performance. Include a clear daily entry form, a saved records list, totals, and report sections that update from those entries.";
    const requirements = runner.extractPromptRequirements(prompt);

    assert.equal(runner.classifyArtifactType(prompt, { workspaceKind: "generic" }, null, null), "desktop-app");
    assert.equal(requirements.some((item) => item.id === "req-record-entry"), true);
    assert.equal(requirements.some((item) => item.id === "req-reporting"), true);
  });
});

test("AgentTaskRunner attaches product workflow requirements to summarizer prompts", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      extractPromptRequirements: (
        prompt: string
      ) => Array<{ id: string; label: string; terms: string[]; mode: "all" | "any" }>;
    };

    const prompt = "Build a desktop YouTube video summarizer app with a URL input, pasted transcript support, summary output, and saved history.";
    const requirements = runner.extractPromptRequirements(prompt);
    const ids = new Set(requirements.map((item) => item.id));

    assert.equal(ids.has("req-summary"), true);
    assert.equal(ids.has("req-transcript"), true);
    assert.equal(ids.has("req-video-source"), true);
    assert.equal(ids.has("req-persistence"), true);
  });
});

test("AgentTaskRunner does not treat meta summary instructions as product summary requirements", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      extractPromptRequirements: (
        prompt: string
      ) => Array<{ id: string; label: string; terms: string[]; mode: "all" | "any" }>;
    };

    const prompt = "Investigate and fix the Windows installer packaging failure for the generated desktop app. Summarize root cause, files changed, and remaining limitations.";
    const requirements = runner.extractPromptRequirements(prompt);
    const ids = new Set(requirements.map((item) => item.id));

    assert.equal(ids.has("req-summary"), false);
  });
});

test("AgentTaskRunner does not treat CRM account management prompts as authentication requirements", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      extractPromptRequirements: (
        prompt: string
      ) => Array<{ id: string; label: string; terms: string[]; mode: "all" | "any" }>;
    };

    const prompt = "Upgrade the desktop app into a CRM with customer management, account management, lead pipeline, and follow-up tracking.";
    const requirements = runner.extractPromptRequirements(prompt);
    const ids = new Set(requirements.map((item) => item.id));

    assert.equal(ids.has("req-auth"), false);
  });
});

test("AgentTaskRunner keeps authentication requirements for real sign-in prompts", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      extractPromptRequirements: (
        prompt: string
      ) => Array<{ id: string; label: string; terms: string[]; mode: "all" | "any" }>;
    };

    const prompt = "Build a desktop admin app with login, password reset, and authentication flow.";
    const requirements = runner.extractPromptRequirements(prompt);
    const ids = new Set(requirements.map((item) => item.id));

    assert.equal(ids.has("req-auth"), true);
  });
});

test("AgentTaskRunner plans library prompts with package-scoped work items even when they mention dashboards as a usage context", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      buildTaskWorkItems: (
        prompt: string,
        workingDirectory: string,
        workspaceKind: "static" | "react" | "generic",
        requestedPaths?: string[]
      ) => Array<{ title: string; instruction: string; allowedPaths?: string[] }>;
    };

    const prompt = "Create a tiny reusable JavaScript package that formats money amounts, percentage deltas, and compact counts for dashboards.";
    const items = runner.buildTaskWorkItems(prompt, "generated-apps/soak-manual-money-format-library", "generic", []);

    assert.equal(items.length, 1);
    assert.equal(items[0]?.title, "Implement requested changes");
    assert.match(items[0]?.instruction ?? "", /library/i);
    assert.equal(items[0]?.allowedPaths?.some((path) => path.endsWith("src/index.js")) ?? false, true);
    assert.equal(items[0]?.allowedPaths?.some((path) => path.endsWith("src/App.tsx")) ?? false, false);
  });
});

test("AgentTaskRunner detects missing generated node-package dependencies", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      generatedNodePackageNeedsInstall: (workingDirectory: string) => Promise<boolean>;
    };

    await mkdir(join(workspaceRoot, "generated-apps", "soak-tool-csv-report-cli"), { recursive: true });
    await writeFile(
      join(workspaceRoot, "generated-apps", "soak-tool-csv-report-cli", "package.json"),
      JSON.stringify({
        name: "soak-tool-csv-report-cli",
        type: "module",
        dependencies: { "csv-parser": "^3.0.0" }
      }, null, 2),
      "utf8"
    );

    assert.equal(await runner.generatedNodePackageNeedsInstall("generated-apps/soak-tool-csv-report-cli"), true);

    await mkdir(join(workspaceRoot, "generated-apps", "soak-tool-csv-report-cli", "node_modules", "csv-parser"), { recursive: true });
    await writeFile(
      join(workspaceRoot, "generated-apps", "soak-tool-csv-report-cli", "node_modules", "csv-parser", "package.json"),
      JSON.stringify({ name: "csv-parser", version: "3.0.0" }, null, 2),
      "utf8"
    );

    assert.equal(await runner.generatedNodePackageNeedsInstall("generated-apps/soak-tool-csv-report-cli"), false);
  });
});

test("AgentTaskRunner recovers generated node-package install failures with heuristic fallback edits", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      ensureGeneratedNodePackageDependencies: (taskId: string, plan: { workingDirectory: string; workspaceKind: "static" | "react" | "generic" }) => Promise<void>;
      tasks: Map<string, {
        id: string;
        prompt: string;
        status: string;
        createdAt: string;
        updatedAt: string;
        summary: string;
        steps: unknown[];
        telemetry: { fallbackUsed: boolean; modelAttempts: Array<{ model: string; outcome: string }> };
      }>;
      taskLogs: Map<string, string[]>;
      generatedNodePackageNeedsInstall: (workingDirectory: string) => Promise<boolean>;
      executeCommand: (taskId: string, request: { command: string; args?: string[]; cwd?: string; timeoutMs?: number }) => Promise<{
        ok: boolean;
        combinedOutput: string;
        stdout: string;
        stderr: string;
      }>;
      collectFixContextFiles: () => Promise<Array<{ path: string; content: string }>>;
      requestStructuredFix: () => Promise<never>;
      tryHeuristicImplementation: (
        taskId: string,
        prompt: string,
        plan: { workingDirectory: string; workspaceKind: "static" | "react" | "generic" }
      ) => Promise<{ summary: string; edits: Array<{ path: string; content: string }> } | null>;
      filterValidEdits: (edits: Array<{ path: string; content: string }>) => Array<{ path: string; content: string }>;
      applyStructuredEdits: (taskId: string, attempt: number, edits: Array<{ path: string; content: string }>) => Promise<string[]>;
      appendLog: (taskId: string, line: string) => void;
    };

    const now = new Date().toISOString();
    runner.tasks = new Map([["task-1", {
      id: "task-1",
      prompt: "[SOAK:api.invoice-service] Build a small API service for invoice workflows with endpoints to list invoices, create an invoice, approve one, and mark one as paid.",
      status: "running",
      createdAt: now,
      updatedAt: now,
      summary: "",
      steps: [],
      telemetry: {
        fallbackUsed: false,
        modelAttempts: []
      }
    }]]);
    runner.taskLogs = new Map([["task-1", []]]);

    let installAttempts = 0;
    let installNeededChecks = 0;
    const appliedEdits: Array<{ path: string; content: string }> = [];
    runner.generatedNodePackageNeedsInstall = async () => {
      installNeededChecks += 1;
      return installNeededChecks === 1;
    };
    runner.executeCommand = async () => {
      installAttempts += 1;
      return {
        ok: false,
        combinedOutput: "npm error code ETARGET\nnpm error notarget No matching version found for express@^0.41.5.",
        stdout: "",
        stderr: "npm error code ETARGET"
      };
    };
    runner.collectFixContextFiles = async () => [{ path: "generated-apps/soak-api-invoice-service/package.json", content: "{}" }];
    runner.requestStructuredFix = async () => {
      throw new Error("structured fix unavailable");
    };
    runner.tryHeuristicImplementation = async () => ({
      summary: "Created a heuristic Invoice Service API service with invoices listing, creation, and lifecycle endpoints.",
      edits: [
        { path: "generated-apps/soak-api-invoice-service/package.json", content: "{\n  \"name\": \"soak-api-invoice-service\"\n}\n" },
        { path: "generated-apps/soak-api-invoice-service/src/server.js", content: "console.log('ok')\n" }
      ]
    });
    runner.filterValidEdits = (edits) => edits;
    runner.applyStructuredEdits = async (_taskId, _attempt, edits) => {
      appliedEdits.push(...edits);
      return edits.map((edit) => edit.path);
    };
    runner.appendLog = () => {};

    await runner.ensureGeneratedNodePackageDependencies("task-1", {
      workingDirectory: "generated-apps/soak-api-invoice-service",
      workspaceKind: "generic"
    });

    assert.equal(installAttempts, 1);
    assert.equal(appliedEdits.length, 2);
    assert.ok(appliedEdits.some((edit) => edit.path.endsWith("package.json")));
  });
});

test("AgentTaskRunner routes artifact outputs with artifact-specific primary actions", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      buildTaskOutput: (
        artifactType: string,
        context?: {
          packageName?: string;
          scripts?: Record<string, string>;
          workingDirectory?: string;
          verification?: { previewReady?: boolean };
        },
        prompt?: string
      ) => { primaryAction: string; runCommand?: string };
    };

    const webOutput = runner.buildTaskOutput("web-app", {
      workingDirectory: "generated-apps/site",
      scripts: { dev: "vite" },
      verification: { previewReady: true }
    });
    const serviceOutput = runner.buildTaskOutput("api-service", {
      workingDirectory: "services/api",
      scripts: { start: "node server.js" }
    });
    const libraryOutput = runner.buildTaskOutput("library", {
      workingDirectory: "packages/sdk",
      scripts: { build: "tsc -p tsconfig.json" }
    });

    assert.equal(webOutput.primaryAction, "preview-web");
    assert.equal(serviceOutput.primaryAction, "run-service");
    assert.equal(serviceOutput.runCommand, "npm start");
    assert.equal(libraryOutput.primaryAction, "inspect-package");
  });
});

test("AgentTaskRunner builds artifact-aware verification summaries and preview readiness", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      buildVerificationReport: (
        checks: Array<{ id: string; label: string; status: "passed" | "failed" | "skipped"; details: string }>,
        artifactType?: string
      ) => { summary: string; previewReady: boolean };
    };

    const webReport = runner.buildVerificationReport([
      { id: "build", label: "Web build", status: "passed", details: "" },
      { id: "launch", label: "Launch", status: "passed", details: "" },
      { id: "preview-health", label: "Preview health", status: "passed", details: "" },
      { id: "ui-smoke", label: "UI smoke", status: "passed", details: "" }
    ], "web-app");
    const serviceReport = runner.buildVerificationReport([
      { id: "build", label: "Service build", status: "passed", details: "" },
      { id: "launch", label: "Service boot", status: "passed", details: "" }
    ], "api-service");

    assert.equal(webReport.summary, "Web build, launch, preview, and smoke passed.");
    assert.equal(webReport.previewReady, true);
    assert.equal(serviceReport.summary, "Service build and boot passed.");
    assert.equal(serviceReport.previewReady, false);
  });
});

test("AgentTaskRunner falls back to count-based verification summaries when checks fail or skip", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      buildVerificationReport: (
        checks: Array<{ id: string; label: string; status: "passed" | "failed" | "skipped"; details: string }>,
        artifactType?: string
      ) => { summary: string; previewReady: boolean };
    };

    const report = runner.buildVerificationReport([
      { id: "build", label: "Tool build", status: "passed", details: "" },
      { id: "test", label: "Tool tests", status: "failed", details: "1 failing test" },
      { id: "lint", label: "Tool lint", status: "skipped", details: "no lint script" }
    ], "script-tool");

    assert.equal(report.summary, "1 passed, 1 failed, 1 skipped");
    assert.equal(report.previewReady, false);
  });
});

test("AgentTaskRunner infers a structured execution spec for dashboard prompts", async () => {
  await withTempDir(async (workspaceRoot) => {
    const appRoot = join(workspaceRoot, "generated-apps", "ops-wallboard");
    await mkdir(join(appRoot, "src"), { recursive: true });
    await writeFile(join(appRoot, "package.json"), JSON.stringify({
      name: "ops-wallboard",
      private: true,
      version: "0.1.0",
      scripts: {
        dev: "vite",
        build: "vite build"
      }
    }, null, 2), "utf8");
    await writeFile(join(appRoot, "index.html"), "<!doctype html><div id=\"root\"></div>\n", "utf8");
    await writeFile(join(appRoot, "src", "main.tsx"), "console.log('main')\n", "utf8");
    await writeFile(join(appRoot, "src", "App.tsx"), "export default function App() { return <main>Ops</main>; }\n", "utf8");

    const runner = createRunner(workspaceRoot) as never as {
      buildExecutionPlan: (prompt: string, workingDirectory?: string) => Promise<{
        spec: {
          starterProfile: string;
          domainFocus: string;
          acceptanceCriteria: string[];
        };
        workItems: Array<{ instruction: string }>;
      }>;
    };

    const plan = await runner.buildExecutionPlan(
      "Build a React wallboard for operations delays with KPI cards, recent incidents, and a quick escalation summary.",
      "generated-apps/ops-wallboard"
    );

    assert.equal(plan.spec.starterProfile, "react-dashboard");
    assert.equal(plan.spec.domainFocus, "operations");
    assert.equal(plan.spec.acceptanceCriteria.some((item) => /metrics, recent activity/i.test(item)), true);
    assert.equal(plan.workItems[0].instruction.includes("Deliverables:"), true);
  });
});

test("AgentTaskRunner infers finance domain focus for billing dashboards", async () => {
  await withTempDir(async (workspaceRoot) => {
    const appRoot = join(workspaceRoot, "generated-apps", "finance-board");
    await mkdir(join(appRoot, "src"), { recursive: true });
    await writeFile(join(appRoot, "package.json"), JSON.stringify({
      name: "finance-board",
      private: true,
      version: "0.1.0",
      scripts: {
        dev: "vite",
        build: "vite build"
      }
    }, null, 2), "utf8");
    await writeFile(join(appRoot, "index.html"), "<!doctype html><div id=\"root\"></div>\n", "utf8");
    await writeFile(join(appRoot, "src", "main.tsx"), "console.log('main')\n", "utf8");
    await writeFile(join(appRoot, "src", "App.tsx"), "export default function App() { return <main>Finance</main>; }\n", "utf8");

    const runner = createRunner(workspaceRoot) as never as {
      buildExecutionPlan: (prompt: string, workingDirectory?: string) => Promise<{
        spec: {
          starterProfile: string;
          domainFocus: string;
          acceptanceCriteria: string[];
        };
      }>;
    };

    const plan = await runner.buildExecutionPlan(
      "Build a React dashboard for invoice collections, revenue visibility, and budget variance tracking.",
      "generated-apps/finance-board"
    );

    assert.equal(plan.spec.starterProfile, "react-dashboard");
    assert.equal(plan.spec.domainFocus, "finance");
    assert.equal(plan.spec.acceptanceCriteria.some((item) => /budgets, invoices, revenue, or payment workflows/i.test(item)), true);
  });
});

test("AgentTaskRunner infers repository conventions from the workspace", async () => {
  await withTempDir(async (workspaceRoot) => {
    const appRoot = join(workspaceRoot, "apps", "console");
    await mkdir(join(appRoot, "src"), { recursive: true });
    await writeFile(join(workspaceRoot, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n", "utf8");
    await writeFile(join(appRoot, "tsconfig.json"), "{\n  \"compilerOptions\": {}\n}\n", "utf8");
    await writeFile(join(appRoot, "package.json"), JSON.stringify({
      name: "console-app",
      private: true,
      version: "0.1.0",
      type: "module",
      scripts: {
        dev: "vite",
        build: "vite build",
        test: "vitest run",
        lint: "eslint ."
      },
      dependencies: {
        react: "^19.0.0",
        "react-dom": "^19.0.0"
      },
      devDependencies: {
        vitest: "^3.0.0",
        eslint: "^9.0.0",
        tailwindcss: "^4.0.0"
      }
    }, null, 2), "utf8");
    await writeFile(join(appRoot, "index.html"), "<!doctype html><div id=\"root\"></div>\n", "utf8");
    await writeFile(join(appRoot, "src", "main.tsx"), "console.log('main')\n", "utf8");
    await writeFile(join(appRoot, "src", "App.tsx"), "export default function App() { return <main>Console</main>; }\n", "utf8");

    const runner = createRunner(workspaceRoot) as never as {
      buildExecutionPlan: (prompt: string, workingDirectory?: string) => Promise<{
        repositoryContext: {
          packageManager: string;
          workspaceShape: string;
          languageStyle: string;
          moduleFormat: string;
          uiFramework: string;
          styling: string;
          testing: string;
          linting: string;
          conventions: string[];
        };
      }>;
    };

    const plan = await runner.buildExecutionPlan("Improve the console app dashboard.", "apps/console");

    assert.equal(plan.repositoryContext.packageManager, "pnpm");
    assert.equal(plan.repositoryContext.workspaceShape, "single-package");
    assert.equal(plan.repositoryContext.languageStyle, "typescript");
    assert.equal(plan.repositoryContext.moduleFormat, "esm");
    assert.equal(plan.repositoryContext.uiFramework, "react");
    assert.equal(plan.repositoryContext.styling, "mixed");
    assert.equal(plan.repositoryContext.testing, "vitest");
    assert.equal(plan.repositoryContext.linting, "eslint");
    assert.equal(plan.repositoryContext.conventions.some((item) => /TypeScript/i.test(item)), true);
  });
});

test("AgentTaskRunner spec verification catches malformed package manifests and missing readmes", async () => {
  await withTempDir(async (workspaceRoot) => {
    const appRoot = join(workspaceRoot, "generated-apps", "broken-service");
    await mkdir(join(appRoot, "src"), { recursive: true });
    await writeFile(join(appRoot, "package.json"), "{ broken json\n", "utf8");
    await writeFile(join(appRoot, "src", "server.js"), "console.log('service')\n", "utf8");

    const runner = createRunner(workspaceRoot) as never as {
      buildExecutionPlan: (prompt: string, workingDirectory?: string) => Promise<unknown>;
      verifyExecutionSpec: (
        plan: unknown,
        artifactType: string,
        scripts: Record<string, string>
      ) => Promise<Array<{ id: string; status: string; details: string }>>;
    };

    const plan = await runner.buildExecutionPlan(
      "Create a new API service in generated-apps/broken-service with README and runnable scripts.",
      "generated-apps/broken-service"
    );
    const checks = await runner.verifyExecutionSpec(plan, "api-service", {});
    const hygiene = checks.find((check) => check.id === "spec-hygiene");

    assert.equal(hygiene?.status, "failed");
    assert.match(hygiene?.details ?? "", /Malformed package manifest/);
    assert.match(hygiene?.details ?? "", /Missing README/);
    assert.match(hygiene?.details ?? "", /Missing build script/);
  });
});

test("AgentTaskRunner writes a generated project README when one is missing", async () => {
  await withTempDir(async (workspaceRoot) => {
    const appRoot = join(workspaceRoot, "generated-apps", "alpha-tool");
    await mkdir(join(appRoot, "src"), { recursive: true });
    await writeFile(join(appRoot, "package.json"), JSON.stringify({
      name: "alpha-tool",
      private: true,
      version: "0.1.0",
      scripts: {
        build: "node -e \"console.log('ok')\"",
        start: "node src/index.js"
      }
    }, null, 2), "utf8");
    await writeFile(join(appRoot, "src", "index.js"), "console.log('ok')\n", "utf8");

    const runner = createRunner(workspaceRoot) as never as {
      buildExecutionPlan: (prompt: string, workingDirectory?: string) => Promise<unknown>;
      ensureGeneratedProjectReadme: (plan: unknown, artifactType?: string) => Promise<void>;
    };

    const plan = await runner.buildExecutionPlan(
      "Create a new CLI tool in generated-apps/alpha-tool with docs.",
      "generated-apps/alpha-tool"
    );
    await runner.ensureGeneratedProjectReadme(plan, "script-tool");

    const readme = await readFile(join(appRoot, "README.md"), "utf8");
    assert.match(readme, /Starter profile:/);
    assert.match(readme, /## Quality Gates/);
    assert.match(readme, /npm start/);
  });
});

test("AgentTaskRunner repairs execution brief failures with scoped structured edits", async () => {
  await withTempDir(async (workspaceRoot) => {
    const appRoot = join(workspaceRoot, "generated-apps", "repair-service");
    await mkdir(join(appRoot, "src"), { recursive: true });
    await writeFile(join(appRoot, "package.json"), JSON.stringify({
      name: "repair-service",
      private: true,
      version: "0.1.0",
      scripts: {
        build: "node -e \"console.log('ok')\"",
        start: "node src/server.js"
      }
    }, null, 2), "utf8");

    const runner = createRunner(workspaceRoot) as never as {
      buildExecutionPlan: (prompt: string, workingDirectory?: string) => Promise<unknown>;
      tryAutoFixExecutionSpec: (
        task: { id: string; prompt: string; steps: unknown[]; status: "running"; updatedAt: string },
        plan: unknown,
        artifactType: string,
        specChecks: Array<{ id: string; label: string; status: "failed"; details: string }>
      ) => Promise<boolean>;
      requestStructuredFix: (...args: unknown[]) => Promise<{ summary: string; edits: Array<{ path: string; content: string }> }>;
      collectFixContextFiles: () => Promise<Array<{ path: string; content: string }>>;
      filterValidEdits: (edits: Array<{ path: string; content: string }>, plan?: unknown) => Array<{ path: string; content: string }>;
      applyStructuredEdits: (taskId: string, attempt: number, edits: Array<{ path: string; content: string }>) => Promise<string[]>;
      prepareGeneratedWorkspace: (taskId: string, plan: unknown) => Promise<void>;
      appendLog: (taskId: string, line: string) => void;
    };

    const plan = await runner.buildExecutionPlan(
      "Create a new API service in generated-apps/repair-service with README and runnable scripts.",
      "generated-apps/repair-service"
    );

    let capturedPrompt = "";
    let applied: Array<{ path: string; content: string }> = [];
    runner.collectFixContextFiles = async () => [{ path: "generated-apps/repair-service/package.json", content: "{}" }];
    runner.requestStructuredFix = async (_taskId, prompt) => {
      capturedPrompt = String(prompt);
      return {
        summary: "Added the missing README and service entry.",
        edits: [
          { path: "generated-apps/repair-service/README.md", content: "# Repair Service\n" },
          { path: "generated-apps/repair-service/src/server.js", content: "console.log('ok')\n" }
        ]
      };
    };
    runner.filterValidEdits = (edits) => edits;
    runner.applyStructuredEdits = async (_taskId, _attempt, edits) => {
      applied = edits;
      return edits.map((edit) => edit.path);
    };
    runner.prepareGeneratedWorkspace = async () => {};
    runner.appendLog = () => {};

    const repaired = await runner.tryAutoFixExecutionSpec({
      id: "task-1",
      prompt: "Create a new API service in generated-apps/repair-service with README and runnable scripts.",
      steps: [],
      status: "running",
      updatedAt: new Date().toISOString()
    }, plan, "api-service", [
      { id: "spec-deliverables", label: "Plan deliverables", status: "failed", details: "Missing expected deliverables for node-api-service: generated-apps/repair-service/README.md." }
    ]);

    assert.equal(repaired, true);
    assert.equal(capturedPrompt.includes("Required deliverables"), true);
    assert.equal(applied.some((edit) => edit.path.endsWith("README.md")), true);
  });
});

test("AgentTaskRunner includes repository conventions in structured repair prompts", async () => {
  await withTempDir(async (workspaceRoot) => {
    const appRoot = join(workspaceRoot, "generated-apps", "repo-aware-fix");
    await mkdir(join(appRoot, "src"), { recursive: true });
    await writeFile(join(appRoot, "package.json"), JSON.stringify({
      name: "repo-aware-fix",
      private: true,
      version: "0.1.0",
      type: "module"
    }, null, 2), "utf8");

    const runner = createRunner(workspaceRoot) as never as {
      buildExecutionPlan: (prompt: string, workingDirectory?: string) => Promise<unknown>;
      requestStructuredFix: (
        taskId: string,
        userPrompt: string,
        commandResult: {
          combinedOutput: string;
          ok: boolean;
          code: number | null;
          signal: string | null;
          stdout: string;
          stderr: string;
          durationMs: number;
          timedOut: boolean;
          commandLine: string;
          cwd: string;
        },
        contextFiles: Array<{ path: string; content: string }>,
        attempt: number,
        stageLabel?: string,
        plan?: unknown
      ) => Promise<{ summary: string; edits: Array<{ path: string; content: string }> }>;
      sendFixModelRequest: (
        taskId: string,
        routes: unknown[],
        messages: Array<{ role: string; content: string }>
      ) => Promise<string>;
      resolveModelRoutes: () => Array<{ model: string; baseUrl: string; apiKey: string; skipAuth: boolean }>;
      appendLog: (taskId: string, line: string) => void;
      ccrService: { sendMessageAdvanced: () => Promise<void> };
    };

    const plan = await runner.buildExecutionPlan(
      "Repair the generated API service in generated-apps/repo-aware-fix.",
      "generated-apps/repo-aware-fix"
    );

    let captured = "";
    runner.resolveModelRoutes = () => [{ model: "test-model", baseUrl: "https://openrouter.ai/api/v1", apiKey: "", skipAuth: false }];
    runner.appendLog = () => {};
    runner.sendFixModelRequest = async (_taskId, _routes, messages) => {
      captured = messages.map((message) => message.content).join("\n");
      return "{\"summary\":\"ok\",\"edits\":[{\"path\":\"generated-apps/repo-aware-fix/README.md\",\"content\":\"# Repo Aware Fix\\n\"}]}";
    };

    const result = await runner.requestStructuredFix(
      "task-1",
      "Repair the generated API service.",
      {
        combinedOutput: "Missing README",
        ok: false,
        code: 1,
        signal: null,
        stdout: "",
        stderr: "Missing README",
        durationMs: 0,
        timedOut: false,
        commandLine: "verify",
        cwd: workspaceRoot
      },
      [{ path: "generated-apps/repo-aware-fix/package.json", content: "{}" }],
      1,
      "Execution spec",
      plan
    );

    assert.equal(result.edits.length, 1);
    assert.match(captured, /Repository context:/);
    assert.match(captured, /Keep Node-facing code in ESM format|Repo conventions:/);
  });
});

test("AgentTaskRunner startup verification stays passed when terminate triggers a later exit event", async () => {
  await withTempDir(async (workspaceRoot) => {
    class FakeStream extends EventEmitter {
      setEncoding(): this { return this; }
    }

    class FakeProc extends EventEmitter {
      stdout = new FakeStream();
      stderr = new FakeStream();
      pid = 1234;
      killed = false;
      exitCode: number | null = null;
    }

    const runner = createRunner(workspaceRoot) as never as {
      executeStartupVerification: (
        taskId: string,
        request: { command: string; args?: string[]; cwd?: string },
        verifyMs: number
      ) => Promise<{ ok: boolean; code: number | null; signal: string | null }>;
      spawnTaskProcess: (command: string, args: string[], cwd: string) => FakeProc;
      terminateProcessTree: (proc: FakeProc) => Promise<void>;
      appendLog: (taskId: string, line: string) => void;
      appendOutput: (taskId: string, text: string) => void;
      activeProcesses: Map<string, FakeProc>;
    };

    const proc = new FakeProc();
    runner.spawnTaskProcess = () => proc;
    runner.terminateProcessTree = async (target) => {
      setImmediate(() => {
        target.exitCode = 1;
        target.emit("exit", 1, null);
      });
    };
    runner.appendLog = () => {};
    runner.appendOutput = () => {};
    runner.activeProcesses = new Map();

    const result = await runner.executeStartupVerification("task-1", {
      command: "npm.cmd",
      args: ["start"],
      cwd: "."
    }, 10);

    assert.equal(result.ok, true);
    assert.equal(result.code, null);
    assert.equal(result.signal, "VERIFIED");
  });
});

test("AgentTaskRunner startup verification waits for cleanup before resolving", async () => {
  await withTempDir(async (workspaceRoot) => {
    class FakeStream extends EventEmitter {
      setEncoding(): this { return this; }
    }

    class FakeProc extends EventEmitter {
      stdout = new FakeStream();
      stderr = new FakeStream();
      pid = 1234;
      killed = false;
      exitCode: number | null = null;
    }

    const runner = createRunner(workspaceRoot) as never as {
      executeStartupVerification: (
        taskId: string,
        request: { command: string; args?: string[]; cwd?: string },
        verifyMs: number
      ) => Promise<{ ok: boolean; code: number | null; signal: string | null }>;
      spawnTaskProcess: (command: string, args: string[], cwd: string) => FakeProc;
      terminateProcessTree: (proc: FakeProc) => Promise<void>;
      appendLog: (taskId: string, line: string) => void;
      appendOutput: (taskId: string, text: string) => void;
      activeProcesses: Map<string, FakeProc>;
    };

    const order: string[] = [];
    const proc = new FakeProc();
    runner.spawnTaskProcess = () => proc;
    runner.terminateProcessTree = async () => {
      order.push("terminate:start");
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push("terminate:end");
    };
    runner.appendLog = () => {};
    runner.appendOutput = () => {};
    runner.activeProcesses = new Map();

    const result = await runner.executeStartupVerification("task-1", {
      command: "npm.cmd",
      args: ["start"],
      cwd: "."
    }, 10);
    order.push("resolved");

    assert.equal(result.ok, true);
    assert.deepEqual(order, ["terminate:start", "terminate:end", "resolved"]);
  });
});

test("AgentTaskRunner does not treat package names containing exceptions as startup failures", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      hasStartupFailureSignal: (output: string) => boolean;
    };

    assert.equal(
      runner.hasStartupFailureSignal("soak-manual-shipment-exceptions-api listening on port 3000"),
      false
    );
    assert.equal(
      runner.hasStartupFailureSignal("Unhandled exception while booting service"),
      true
    );
  });
});

test("AgentTaskRunner recognizes transient generated install lock failures", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      isTransientGeneratedInstallLockFailure: (result: {
        combinedOutput?: string;
        stderr?: string;
        stdout?: string;
      }) => boolean;
    };

    assert.equal(
      runner.isTransientGeneratedInstallLockFailure({
        combinedOutput: "npm error code EBUSY\nnpm error errno -4082\nnpm error EBUSY: resource busy or locked, rename 'node_modules\\\\electron\\\\dist\\\\resources\\\\default_app.asar'"
      }),
      true
    );
    assert.equal(
      runner.isTransientGeneratedInstallLockFailure({
        combinedOutput: "npm error code ETARGET\nnpm error notarget No matching version found"
      }),
      false
    );
  });
});

test("AgentTaskRunner recognizes transient generated packaging lock failures", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      isTransientGeneratedPackagingLockFailure: (result: {
        combinedOutput?: string;
        stderr?: string;
        stdout?: string;
      }) => boolean;
    };

    assert.equal(
      runner.isTransientGeneratedPackagingLockFailure({
        combinedOutput: "Error: EPERM: operation not permitted, unlink 'D:\\\\tmp\\\\desktop-smoke\\\\release\\\\win-unpacked\\\\resources\\\\app.asar'"
      }),
      true
    );
    assert.equal(
      runner.isTransientGeneratedPackagingLockFailure({
        combinedOutput: "electron-builder could not resolve icon.ico"
      }),
      false
    );
  });
});

test("AgentTaskRunner resolves ordered unique model routes from cloud and local settings", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunnerWithServices(workspaceRoot, {
      apiKey: "sk-or-v1-secret",
      defaultModel: "qwen/qwen3-coder:free",
      models: ["qwen/qwen3-coder:free", "google/gemini-2.0-flash-001"],
      ollamaEnabled: true,
      ollamaModels: ["qwen2.5-coder:14b"],
      routing: {
        default: "qwen/qwen3-coder:free",
        think: "google/gemini-2.0-flash-001",
        longContext: "google/gemini-2.0-flash-001"
      }
    }) as never as {
      resolveModelRoutes: (stageLabel?: string) => Array<{ model: string; skipAuth: boolean }>;
    };

    const routes = runner.resolveModelRoutes();

    assert.deepEqual(routes.map((route) => [route.model, route.skipAuth]), [
      ["qwen/qwen3-coder:free", false],
      ["google/gemini-2.0-flash-001", false],
      ["qwen2.5-coder:14b", true]
    ]);
  });
});

test("AgentTaskRunner reorders model routes using persisted reliability scores", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunnerWithServices(workspaceRoot, {
      apiKey: "sk-or-v1-secret",
      defaultModel: "first-model",
      models: ["first-model", "second-model"],
      routing: {
        default: "first-model",
        think: "second-model",
        longContext: "second-model"
      }
    }) as never as {
      resolveModelRoutes: (stageLabel?: string) => Array<{ model: string }>;
      modelRouteStats: Map<string, { successes: number; failures: number; transientFailures: number }>;
      buildModelRouteKey: (route: { model: string; baseUrl: string; skipAuth: boolean }) => string;
    };

    runner.modelRouteStats = new Map([
      [runner.buildModelRouteKey({ model: "first-model", baseUrl: "https://openrouter.ai/api/v1", skipAuth: false }), {
        successes: 1,
        failures: 2,
        transientFailures: 0,
        semanticFailures: 0
      }],
      [runner.buildModelRouteKey({ model: "second-model", baseUrl: "https://openrouter.ai/api/v1", skipAuth: false }), {
        successes: 3,
        failures: 0,
        transientFailures: 0,
        semanticFailures: 0
      }]
    ]);

    const routes = runner.resolveModelRoutes();

    assert.equal(routes[0]?.model, "second-model");
  });
});

test("AgentTaskRunner penalizes semantic model failures in route ordering", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunnerWithServices(workspaceRoot, {
      apiKey: "sk-or-v1-secret",
      defaultModel: "first-model",
      models: ["first-model", "second-model"],
      routing: {
        default: "first-model",
        think: "second-model",
        longContext: "second-model"
      }
    }) as never as {
      resolveModelRoutes: (stageLabel?: string) => Array<{ model: string }>;
      modelRouteStats: Map<string, { successes: number; failures: number; transientFailures: number; semanticFailures: number }>;
      buildModelRouteKey: (route: { model: string; baseUrl: string; skipAuth: boolean }) => string;
    };

    runner.modelRouteStats = new Map([
      [runner.buildModelRouteKey({ model: "first-model", baseUrl: "https://openrouter.ai/api/v1", skipAuth: false }), {
        successes: 2,
        failures: 0,
        transientFailures: 0,
        semanticFailures: 2
      }],
      [runner.buildModelRouteKey({ model: "second-model", baseUrl: "https://openrouter.ai/api/v1", skipAuth: false }), {
        successes: 1,
        failures: 0,
        transientFailures: 0,
        semanticFailures: 0
      }]
    ]);

    const routes = runner.resolveModelRoutes();

    assert.equal(routes[0]?.model, "second-model");
  });
});

test("AgentTaskRunner uses stage-aware route order for implementation, repair, and planning", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunnerWithServices(workspaceRoot, {
      apiKey: "sk-or-v1-secret",
      defaultModel: "generator-model",
      models: ["generator-model", "repair-model", "planner-model"],
      routing: {
        default: "generator-model",
        think: "repair-model",
        longContext: "planner-model"
      }
    }) as never as {
      resolveModelRoutes: (stageLabel?: string) => Array<{ model: string }>;
    };

    assert.equal(runner.resolveModelRoutes("Implementation")[0]?.model, "generator-model");
    assert.equal(runner.resolveModelRoutes("Build recovery")[0]?.model, "repair-model");
    assert.equal(runner.resolveModelRoutes("Plan task execution")[0]?.model, "planner-model");
  });
});

test("AgentTaskRunner prefers coding-focused cloud models for repair stages", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunnerWithServices(workspaceRoot, {
      apiKey: "sk-or-v1-secret",
      defaultModel: "deepseek/deepseek-v3.2",
      models: ["deepseek/deepseek-v3.2", "qwen/qwen3-coder-next", "google/gemini-2.5-flash-lite-preview-09-2025"],
      routing: {
        default: "deepseek/deepseek-v3.2",
        think: "deepseek/deepseek-v3.2",
        longContext: "google/gemini-2.5-flash-lite-preview-09-2025"
      }
    }) as never as {
      resolveModelRoutes: (stageLabel?: string) => Array<{ model: string }>;
    };

    assert.equal(runner.resolveModelRoutes("Build recovery")[0]?.model, "qwen/qwen3-coder-next");
  });
});

test("AgentTaskRunner prefers long-context cloud models for planner stages even without a dedicated planner route", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunnerWithServices(workspaceRoot, {
      apiKey: "sk-or-v1-secret",
      defaultModel: "qwen/qwen3-coder-next",
      models: ["qwen/qwen3-coder-next", "google/gemini-2.5-flash-lite-preview-09-2025", "anthropic/claude-3.7-sonnet"],
      routing: {
        default: "qwen/qwen3-coder-next",
        think: "qwen/qwen3-coder-next",
        longContext: "qwen/qwen3-coder-next"
      }
    }) as never as {
      resolveModelRoutes: (stageLabel?: string) => Array<{ model: string }>;
    };

    assert.equal(runner.resolveModelRoutes("Plan task execution")[0]?.model, "google/gemini-2.5-flash-lite-preview-09-2025");
  });
});

test("AgentTaskRunner prefers coding-focused cloud models for implementation stages even when the default route is generic", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunnerWithServices(workspaceRoot, {
      apiKey: "sk-or-v1-secret",
      defaultModel: "deepseek/deepseek-v3.2",
      models: ["deepseek/deepseek-v3.2", "qwen/qwen3-coder-next", "google/gemini-2.5-flash-lite-preview-09-2025"],
      routing: {
        default: "deepseek/deepseek-v3.2",
        think: "deepseek/deepseek-v3.2",
        longContext: "google/gemini-2.5-flash-lite-preview-09-2025"
      }
    }) as never as {
      resolveModelRoutes: (stageLabel?: string) => Array<{ model: string }>;
    };

    assert.equal(runner.resolveModelRoutes("Implementation")[0]?.model, "qwen/qwen3-coder-next");
  });
});

test("AgentTaskRunner prefers vision-capable cloud models when the task includes image input", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunnerWithServices(workspaceRoot, {
      apiKey: "sk-or-v1-secret",
      defaultModel: "qwen/qwen3-coder-next",
      models: ["qwen/qwen3-coder-next", "google/gemini-2.5-flash-lite-preview-09-2025", "meta/llama-3.1-70b-instruct"],
      routing: {
        default: "qwen/qwen3-coder-next",
        think: "qwen/qwen3-coder-next",
        longContext: "meta/llama-3.1-70b-instruct"
      }
    }) as never as {
      resolveModelRoutes: (stageLabel?: string, options?: { requiresVision?: boolean }) => Array<{ model: string }>;
    };

    assert.equal(
      runner.resolveModelRoutes("Implementation", { requiresVision: true })[0]?.model,
      "google/gemini-2.5-flash-lite-preview-09-2025"
    );
  });
});

test("AgentTaskRunner filters oversized and vision-heavy local routes for implementation when better local models exist", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunnerWithServices(workspaceRoot, {
      apiKey: "sk-or-v1-secret",
      defaultModel: "ollama/gpt-oss:120b",
      models: ["google/gemini-2.0-flash-001"],
      ollamaEnabled: true,
      ollamaModels: ["gpt-oss:120b", "qwen3-vl:30b", "qwen2.5-coder:14b", "deepseek-coder:6.7b"],
      routing: {
        default: "ollama/gpt-oss:120b",
        think: "google/gemini-2.0-flash-001",
        longContext: "google/gemini-2.0-flash-001"
      }
    }) as never as {
      resolveModelRoutes: (stageLabel?: string) => Array<{ model: string; skipAuth: boolean }>;
    };

    const routes = runner.resolveModelRoutes("Implementation");

    assert.deepEqual(routes.map((route) => [route.model, route.skipAuth]), [
      ["google/gemini-2.0-flash-001", false],
      ["deepseek-coder:6.7b", true],
      ["qwen2.5-coder:14b", true]
    ]);
  });
});

test("AgentTaskRunner falls back to the next model route on transient request failure", async () => {
  await withTempDir(async (workspaceRoot) => {
    const seenModels: string[] = [];
    const runner = createRunnerWithServices(workspaceRoot, {}, {
      sendMessageAdvanced: async (
        _messages: unknown,
        model: string,
        onChunk: (chunk: string) => void
      ) => {
        seenModels.push(model);
        if (model === "first-model") {
          throw new Error("API error 503: provider overloaded");
        }
        onChunk("{\"summary\":\"ok\",\"edits\":[{\"path\":\"file.txt\",\"content\":\"hello\"}]}");
        return "{\"summary\":\"ok\",\"edits\":[{\"path\":\"file.txt\",\"content\":\"hello\"}]}";
      }
    }) as never as {
      sendFixModelRequest: (
        taskId: string,
        routes: Array<{ model: string; baseUrl: string; apiKey: string; skipAuth: boolean }>,
        messages: Array<{ role: string; content: string }>,
        label: "initial" | "json-retry"
      ) => Promise<string>;
      appendLog: (taskId: string, line: string) => void;
    };

    runner.appendLog = () => {};

    const response = await runner.sendFixModelRequest("task-1", [
      { model: "first-model", baseUrl: "https://example.com", apiKey: "key", skipAuth: false },
      { model: "second-model", baseUrl: "https://example.com", apiKey: "key", skipAuth: false }
    ], [{ role: "user", content: "hello" }], "initial");

    assert.match(response, /"summary":"ok"/);
    assert.deepEqual(seenModels, ["first-model", "first-model", "second-model"]);
  });
});

test("AgentTaskRunner treats local model capacity errors as transient route failures", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      isTransientModelFailure: (message: string) => boolean;
    };

    assert.equal(
      runner.isTransientModelFailure("API error 500: model requires more system memory (51.3 GiB) than is available (33.0 GiB)"),
      true
    );
  });
});

test("AgentTaskRunner reports all exhausted model routes when every transient attempt fails", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunnerWithServices(workspaceRoot, {}, {
      sendMessageAdvanced: async () => {
        throw new Error("API error 503: provider overloaded");
      }
    }) as never as {
      sendFixModelRequest: (
        taskId: string,
        routes: Array<{ model: string; baseUrl: string; apiKey: string; skipAuth: boolean }>,
        messages: Array<{ role: string; content: string }>,
        label: "initial" | "json-retry",
        stageLabel?: string
      ) => Promise<string>;
      appendLog: (taskId: string, line: string) => void;
    };

    runner.appendLog = () => {};

    await assert.rejects(
      () => runner.sendFixModelRequest("task-1", [
        { model: "first-model", baseUrl: "https://example.com", apiKey: "key", skipAuth: false },
        { model: "second-model", baseUrl: "https://example.com", apiKey: "key", skipAuth: false }
      ], [{ role: "user", content: "hello" }], "initial", "Implementation"),
      /Implementation exhausted all configured model routes\. Tried: first-model .*second-model/
    );
  });
});

test("AgentTaskRunner records selected and fallback model telemetry during route fallback", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunnerWithServices(workspaceRoot, {}, {
      sendMessageAdvanced: async (
        _messages: unknown,
        model: string,
        onChunk: (chunk: string) => void
      ) => {
        if (model === "first-model") {
          throw new Error("API error 503: provider overloaded");
        }
        onChunk("{\"summary\":\"ok\",\"edits\":[{\"path\":\"file.txt\",\"content\":\"hello\"}]}");
        return "{\"summary\":\"ok\",\"edits\":[{\"path\":\"file.txt\",\"content\":\"hello\"}]}";
      }
    }) as never as {
      sendFixModelRequest: (
        taskId: string,
        routes: Array<{ model: string; baseUrl: string; apiKey: string; skipAuth: boolean }>,
        messages: Array<{ role: string; content: string }>,
        label: "initial" | "json-retry"
      ) => Promise<string>;
      tasks: Map<string, {
        id: string;
        telemetry?: {
          selectedModel?: string;
          fallbackModel?: string;
          fallbackUsed: boolean;
          modelAttempts: Array<{ model: string; outcome: string }>;
        };
      }>;
      taskLogs: Map<string, string[]>;
    };

    const now = new Date().toISOString();
    runner.tasks = new Map([
      ["task-1", {
        id: "task-1",
        prompt: "fix the build",
        status: "running",
        createdAt: now,
        updatedAt: now,
        summary: "",
        steps: [],
        telemetry: {
          fallbackUsed: false,
          modelAttempts: []
        }
      }]
    ]) as never;
    runner.taskLogs = new Map([["task-1", []]]);

    await runner.sendFixModelRequest("task-1", [
      { model: "first-model", baseUrl: "https://example.com", apiKey: "key", skipAuth: false },
      { model: "second-model", baseUrl: "https://example.com", apiKey: "key", skipAuth: false }
    ], [{ role: "user", content: "hello" }], "initial");

    const telemetry = runner.tasks.get("task-1")?.telemetry;
    assert.equal(telemetry?.selectedModel, "first-model");
    assert.equal(telemetry?.fallbackUsed, true);
    assert.equal(telemetry?.fallbackModel, "second-model");
    assert.deepEqual(
      telemetry?.modelAttempts.map((attempt) => [attempt.model, attempt.outcome]),
      [
        ["first-model", "transient-error"],
        ["first-model", "transient-error"],
        ["second-model", "success"]
      ]
    );
  });
});

test("AgentTaskRunner blacklists a transiently failing model only after repeated failures and then stops retrying it", async () => {
  await withTempDir(async (workspaceRoot) => {
    const seenModels: string[] = [];
    const runner = createRunnerWithServices(workspaceRoot, {}, {
      sendMessageAdvanced: async (
        _messages: unknown,
        model: string,
        onChunk: (chunk: string) => void
      ) => {
        seenModels.push(model);
        if (model === "first-model") {
          throw new Error("API error 503: provider overloaded");
        }
        onChunk("{\"summary\":\"ok\",\"edits\":[{\"path\":\"file.txt\",\"content\":\"hello\"}]}");
        return "{\"summary\":\"ok\",\"edits\":[{\"path\":\"file.txt\",\"content\":\"hello\"}]}";
      }
    }) as never as {
      sendFixModelRequest: (
        taskId: string,
        routes: Array<{ model: string; baseUrl: string; apiKey: string; skipAuth: boolean }>,
        messages: Array<{ role: string; content: string }>,
        label: "initial" | "json-retry"
      ) => Promise<string>;
      tasks: Map<string, {
        id: string;
        prompt: string;
        status: string;
        createdAt: string;
        updatedAt: string;
        summary: string;
        steps: unknown[];
        telemetry: { fallbackUsed: boolean; modelAttempts: unknown[] };
      }>;
      taskLogs: Map<string, string[]>;
    };

    const now = new Date().toISOString();
    runner.tasks = new Map([
      ["task-1", {
        id: "task-1",
        prompt: "fix the build",
        status: "running",
        createdAt: now,
        updatedAt: now,
        summary: "",
        steps: [],
        telemetry: {
          fallbackUsed: false,
          modelAttempts: []
        }
      }]
    ]);
    runner.taskLogs = new Map([["task-1", []]]);

    const routes = [
      { model: "first-model", baseUrl: "https://example.com", apiKey: "key", skipAuth: false },
      { model: "second-model", baseUrl: "https://example.com", apiKey: "key", skipAuth: false }
    ];

    await runner.sendFixModelRequest("task-1", routes, [{ role: "user", content: "hello" }], "initial");
    await runner.sendFixModelRequest("task-1", routes, [{ role: "user", content: "hello again" }], "initial");

    assert.deepEqual(seenModels, [
      "first-model",
      "first-model",
      "second-model",
      "first-model",
      "second-model"
    ]);
  });
});

test("AgentTaskRunner records failed step titles as telemetry failure stages", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      runStep: (
        task: {
          id: string;
          status: "running";
          steps: Array<unknown>;
          updatedAt: string;
          telemetry?: { failureStage?: string; failureCategory?: string; lastStage?: string; fallbackUsed: boolean; modelAttempts: unknown[] };
        },
        title: string,
        work: () => Promise<{ summary: string }>
      ) => Promise<{ summary: string }>;
    };

    const task = {
      id: "task-1",
      prompt: "fail this task",
      status: "running" as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      summary: "",
      steps: [],
      telemetry: {
        fallbackUsed: false,
        modelAttempts: []
      } as { failureStage?: string; failureCategory?: string; lastStage?: string; fallbackUsed: boolean; modelAttempts: unknown[] }
    };

    await assert.rejects(
      () => runner.runStep(task, "Plan task execution", async () => {
        throw new Error("boom");
      }),
      /boom/
    );

    assert.equal(task.telemetry.failureStage, "Plan task execution");
    assert.equal(task.telemetry.lastStage, "Plan task execution");
    assert.equal(task.telemetry.failureCategory, "unknown");
  });
});

test("AgentTaskRunner classifies failure categories from stage and message", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      classifyFailureCategory: (stage: string, message: string) => string;
    };

    assert.equal(runner.classifyFailureCategory("Build recovery", "Build still failing after fixes."), "build-error");
    assert.equal(runner.classifyFailureCategory("Dependency install", "npm error notarget No matching version found for express@^0.41.5."), "build-error");
    assert.equal(runner.classifyFailureCategory("Implementation", "Implementation model returned malformed JSON after retry."), "malformed-json");
    assert.equal(runner.classifyFailureCategory("Verify preview health", "Preview returned a blank page."), "preview-error");
    assert.equal(runner.classifyFailureCategory("Plan task execution", "Path escapes the workspace root."), "unsupported-path");
  });
});

test("AgentTaskRunner persists verification telemetry in task state", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      tasks: Map<string, unknown>;
      taskLogs: Map<string, string[]>;
      updateTaskVerification: (
        task: {
          updatedAt: string;
          artifactType?: string;
          telemetry?: {
            fallbackUsed: boolean;
            modelAttempts: unknown[];
            finalVerificationResult?: string;
            verificationSummary?: string;
          };
          verification?: { summary: string };
        },
        checks: Array<{ id: string; label: string; status: "passed" | "failed" | "skipped"; details: string }>
      ) => void;
    };

    const now = new Date().toISOString();
    const task = {
      id: "task-1",
      prompt: "verify this app",
      status: "running",
      createdAt: now,
      updatedAt: now,
      summary: "",
      steps: [],
      telemetry: {
        fallbackUsed: false,
        modelAttempts: [],
        selectedModel: "qwen2.5-coder:14b"
      }
    };
    runner.tasks = new Map([["task-1", task]]);
    runner.taskLogs = new Map([["task-1", []]]);

    runner.updateTaskVerification(task, [
      { id: "build", label: "Build", status: "passed", details: "build passed" },
      { id: "lint", label: "Lint", status: "skipped", details: "no lint script" }
    ]);

    const reloaded = createRunner(workspaceRoot);
    const restored = reloaded.getTask("task-1");

    assert.equal(restored?.telemetry?.selectedModel, "qwen2.5-coder:14b");
    assert.equal(restored?.telemetry?.finalVerificationResult, "passed");
    assert.match(restored?.telemetry?.verificationSummary ?? "", /passed/i);
  });
});

test("AgentTaskRunner tolerates lightly malformed generated package.json scripts", async () => {
  await withTempDir(async (workspaceRoot) => {
    await mkdir(join(workspaceRoot, "generated-apps", "api-loose-json"), { recursive: true });
    await writeFile(
      join(workspaceRoot, "generated-apps", "api-loose-json", "package.json"),
      `{ "name": "api-loose-json", "private": true, "version": "0.1.0", "type": "module", "scripts": { "build": "node -e\\"console.log('Service ready')\\'", "start": "node src/server.js" } }`,
      "utf8"
    );

    const runner = createRunner(workspaceRoot) as never as {
      tryReadPackageJson: (targetDirectory?: string) => Promise<{ scripts?: { build?: string; start?: string } } | null>;
    };

    const packageJson = await runner.tryReadPackageJson("generated-apps/api-loose-json");

    assert.equal(packageJson?.scripts?.start, "node src/server.js");
    assert.match(packageJson?.scripts?.build ?? "", /Service ready/);
  });
});

test("AgentTaskRunner normalizes malformed package.json edits before writing", async () => {
  await withTempDir(async (workspaceRoot) => {
    await mkdir(join(workspaceRoot, "generated-apps", "pkg-write"), { recursive: true });
    await writeFile(
      join(workspaceRoot, "generated-apps", "pkg-write", "package.json"),
      JSON.stringify({ name: "pkg-write", private: true, version: "0.1.0" }, null, 2),
      "utf8"
    );

    const runner = createRunner(workspaceRoot) as never as {
      applyStructuredEdits: (
        taskId: string,
        attempt: number,
        edits: Array<{ path: string; content: string }>
      ) => Promise<string[]>;
      tryReadPackageJson: (targetDirectory?: string) => Promise<{ scripts?: { start?: string; build?: string } } | null>;
    };

    const changed = await runner.applyStructuredEdits("task-1", 1, [
      {
        path: "generated-apps/pkg-write/package.json",
        content: `{ "name": "pkg-write", "private": true, "version": "0.1.0", "scripts": { "build": "node -e\\"console.log('ready')\\'", "start": "node src/server.js" } }`
      }
    ]);

    assert.deepEqual(changed, ["generated-apps/pkg-write/package.json"]);
    const packageJson = await runner.tryReadPackageJson("generated-apps/pkg-write");
    assert.equal(packageJson?.scripts?.start, "node src/server.js");
    assert.match(packageJson?.scripts?.build ?? "", /ready/);
  });
});

test("AgentTaskRunner wires unused resolve handlers into admin table row actions", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      tryHeuristicFix: (
        taskId: string,
        buildResult: { combinedOutput: string },
        contextFiles: Array<{ path: string; content: string }>
      ) => Promise<{ summary: string; edits: Array<{ path: string; content: string }> } | null>;
    };

    const fix = await runner.tryHeuristicFix(
      "task-1",
      {
        combinedOutput: "generated-apps/create-tiny-admin/src/App.tsx(35,9): error TS6133: 'handleResolve' is declared but its value is never read."
      },
      [{
        path: "generated-apps/create-tiny-admin/src/App.tsx",
        content: `import { useState } from 'react';

function App() {
  const [returns, setReturns] = useState([{ id: 1, status: "Pending", receivedDate: new Date("2023-10-01") }]);

  const handleResolve = (id: number) => {
    setReturns((current) => current.map((returnItem) => returnItem.id === id ? { ...returnItem, status: "Resolved" } : returnItem));
  };

  return (
    <div>
      <h1>Warehouse Returns</h1>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Status</th>
            <th>Received Date</th>
          </tr>
        </thead>
        <tbody>
          {returns.map((returnItem) => (
            <tr key={returnItem.id}>
              <td>{returnItem.id}</td>
              <td>{returnItem.status}</td>
              <td>{returnItem.receivedDate.toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default App;
`
      }]
    );

    assert.match(fix?.summary ?? "", /Wired the unused action handler handleResolve/i);
    assert.match(fix?.edits[0]?.content ?? "", /<th>Action<\/th>/);
    assert.match(fix?.edits[0]?.content ?? "", /onClick=\{\(\) => handleResolve\(returnItem\.id\)\}/);
    assert.match(fix?.edits[0]?.content ?? "", />Resolve<\/button>/);
  });
});

test("AgentTaskRunner includes explicitly requested root files in react work item allowlists", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      buildTaskWorkItems: (
        prompt: string,
        workingDirectory: string,
        workspaceKind: "static" | "react" | "generic",
        requestedPaths?: string[]
      ) => Array<{ allowedPaths?: string[] }>;
      extractExplicitPromptFilePaths: (prompt: string, workingDirectory: string) => string[];
      resolveWorkspaceKindForPrompt: (
        prompt: string,
        detectedKind: "static" | "react" | "generic",
        requestedPaths: string[]
      ) => "static" | "react" | "generic";
    };

    const prompt = "Create a small static demo page in generated-apps/agent-smoke with index.html, styles.css, and app.js.";
    const requestedPaths = runner.extractExplicitPromptFilePaths(prompt, "generated-apps/agent-smoke");
    const workspaceKind = runner.resolveWorkspaceKindForPrompt(prompt, "react", requestedPaths);
    const items = runner.buildTaskWorkItems(prompt, "generated-apps/agent-smoke", workspaceKind, requestedPaths);
    const allowed = new Set(items.flatMap((item) => item.allowedPaths ?? []));

    assert.equal(workspaceKind, "static");
    assert.ok(allowed.has("generated-apps/agent-smoke/index.html"));
    assert.ok(allowed.has("generated-apps/agent-smoke/styles.css"));
    assert.ok(allowed.has("generated-apps/agent-smoke/app.js"));
  });
});

test("AgentTaskRunner ignores soak markers when extracting explicit prompt file paths", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      extractExplicitPromptFilePaths: (prompt: string, workingDirectory: string) => string[];
    };

    const requestedPaths = runner.extractExplicitPromptFilePaths(
      "[SOAK:realworld.json-audit-cli] Create a command-line tool that reads a JSON file and prints a compact audit summary.",
      "generated-apps/soak-realworld-json-audit-cli"
    );

    assert.deepEqual(requestedPaths, []);
  });
});

test("AgentTaskRunner ignores bare Node.js mentions when extracting explicit prompt file paths", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      extractExplicitPromptFilePaths: (prompt: string, workingDirectory: string) => string[];
    };

    const requestedPaths = runner.extractExplicitPromptFilePaths(
      "Build an Electron app with Node.js backend logic, plus main.js and preload.js.",
      "generated-apps/desktop-smoke"
    );

    assert.deepEqual(requestedPaths.sort(), [
      "generated-apps/desktop-smoke/main.js",
      "generated-apps/desktop-smoke/preload.js"
    ]);
  });
});

test("AgentTaskRunner approval gate blocks desktop outputs missing packaging signals", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      buildTaskApproval: (
        plan: {
          spec: { starterProfile: string };
        },
        task: {
          artifactType?: string;
          verification?: { checks: Array<{ label: string; status: string }> };
        },
        packageManifest: { main?: string } | null,
        scripts: Record<string, string | undefined>
      ) => { ok: boolean; summary: string };
    };

    const approval = runner.buildTaskApproval(
      {
        spec: { starterProfile: "electron-desktop" }
      },
      {
        artifactType: "desktop-app",
        verification: {
          checks: [{ label: "Build", status: "passed" }]
        }
      },
      {
        main: "dist/main.js"
      },
      {
        build: "npm run build",
        start: "electron ."
      }
    );

    assert.equal(approval.ok, false);
    assert.match(approval.summary, /package:win script is missing/i);
  });
});

test("AgentTaskRunner approval gate passes healthy desktop outputs", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      buildTaskApproval: (
        plan: {
          spec: { starterProfile: string };
        },
        task: {
          artifactType?: string;
          verification?: { checks: Array<{ label: string; status: string }> };
        },
        packageManifest: { main?: string } | null,
        scripts: Record<string, string | undefined>
      ) => { ok: boolean; summary: string };
    };

    const approval = runner.buildTaskApproval(
      {
        spec: { starterProfile: "electron-desktop" }
      },
      {
        artifactType: "desktop-app",
        verification: {
          checks: [{ label: "Build", status: "passed" }]
        }
      },
      {
        main: "dist/main.js"
      },
      {
        build: "npm run build",
        start: "electron .",
        "package:win": "electron-builder --win nsis"
      }
    );

    assert.equal(approval.ok, true);
    assert.match(approval.summary, /approval passed for desktop output/i);
  });
});

test("AgentTaskRunner uses node-package bootstrap for new script-tool prompts in the Cipher workspace", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      detectBootstrapPlan: (
        prompt: string,
        inspection: { packageName?: string }
      ) => { template: string; targetDirectory: string; artifactType?: string } | null;
    };

    const plan = runner.detectBootstrapPlan(
      "[SOAK:tool.markdown-cli] Create a command-line tool that reads a markdown file and prints a compact section summary to the terminal.",
      { packageName: "cipher-ai" }
    );

    assert.equal(plan?.template, "node-package");
    assert.equal(plan?.artifactType, "script-tool");
    assert.match(plan?.targetDirectory ?? "", /^generated-apps\//);
  });
});

test("AgentTaskRunner routes kanban prompts to kanban builder mode instead of notes mode", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      detectBuilderMode: (prompt: string) => string | null;
      buildTaskWorkItems: (
        prompt: string,
        workingDirectory: string,
        workspaceKind: "static" | "react" | "generic",
        requestedPaths?: string[]
      ) => Array<{ title: string }>;
    };

    const prompt = "[SOAK:react.kanban-board] Build a kanban task board with todo, in progress, and done columns plus add-task input and status changes.";
    const mode = runner.detectBuilderMode(prompt);
    const items = runner.buildTaskWorkItems(prompt, "generated-apps/kanban-board", "react", []);

    assert.equal(mode, "kanban");
    assert.deepEqual(items.map((item) => item.title), [
      "Build kanban layout",
      "Add task creation and status flow",
      "Polish board design"
    ]);
  });
});

test("AgentTaskRunner bootstraps kanban prompts into generated react projects", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      detectBootstrapPlan: (
        prompt: string,
        inspection: { packageName?: string }
      ) => { template: string; targetDirectory: string; starterProfile?: string } | null;
    };

    const plan = runner.detectBootstrapPlan(
      "[SOAK:react.kanban-board] Build a kanban task board with todo, in progress, and done columns plus add-task input and status changes.",
      { packageName: "cipher-ai" }
    );

    assert.equal(plan?.template, "react-vite");
    assert.equal(plan?.starterProfile, "react-kanban");
    assert.match(plan?.targetDirectory ?? "", /^generated-apps\//);
  });
});

test("AgentTaskRunner keeps desktop prompts on the desktop scaffold even when a static folder already exists", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      extractExplicitPromptFilePaths: (prompt: string, workingDirectory: string) => string[];
      resolveWorkspaceKindForPrompt: (
        prompt: string,
        detectedKind: "static" | "react" | "generic",
        requestedPaths: string[]
      ) => "static" | "react" | "generic";
      buildBootstrapPlanForTarget: (
        prompt: string,
        targetDirectory: string
      ) => { template: "static" | "react-vite" | "nextjs" | "node-package"; starterProfile: string };
    };

    const prompt = [
      "Build a production-ready Electron desktop app in generated-apps/youtube-video-summarizer-pro.",
      "Required files: main.js, preload.js, renderer.js, index.html, styles.css."
    ].join(" ");

    const requestedPaths = runner.extractExplicitPromptFilePaths(prompt, "generated-apps/youtube-video-summarizer-pro");
    const workspaceKind = runner.resolveWorkspaceKindForPrompt(prompt, "static", requestedPaths);
    const plan = runner.buildBootstrapPlanForTarget(prompt, "generated-apps/youtube-video-summarizer-pro");

    assert.equal(workspaceKind, "react");
    assert.equal(plan.template, "react-vite");
    assert.equal(plan.starterProfile, "electron-desktop");
  });
});

test("AgentTaskRunner uses richer dashboard starter files for react bootstrap profiles", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      buildReactBootstrapStarterFiles: (plan: {
        starterProfile: string;
        targetDirectory: string;
        domainFocus?: string;
      }) => Array<{ path: string; content: string }>;
    };

    const files = runner.buildReactBootstrapStarterFiles({
      starterProfile: "react-dashboard",
      targetDirectory: "generated-apps/ops-board"
    });

    assert.ok(files.some((file) => file.path === "src/App.tsx" && /KPI|metric|incident/i.test(file.content)));
    assert.ok(files.some((file) => file.path === "src/App.css"));
    assert.ok(files.some((file) => file.path === "src/index.css"));
  });
});

test("AgentTaskRunner uses a desktop-specific starter shell for electron bootstrap profiles", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      buildReactBootstrapStarterFiles: (plan: {
        starterProfile: string;
        targetDirectory: string;
        domainFocus?: string;
      }) => Array<{ path: string; content: string }>;
    };

    const files = runner.buildReactBootstrapStarterFiles({
      starterProfile: "electron-desktop",
      targetDirectory: "generated-apps/desk-ops"
    });

    assert.ok(files.some((file) => file.path === "src/App.tsx" && /Desktop starter app|Launch checklist|Quick actions/i.test(file.content)));
    assert.ok(files.some((file) => file.path === "src/App.css" && /desktop-starter-shell/.test(file.content)));
    assert.ok(files.some((file) => file.path === "src/index.css" && /color-scheme: dark/.test(file.content)));
  });
});

test("AgentTaskRunner applies finance-specific dashboard starter copy when domain focus is finance", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      buildReactBootstrapStarterFiles: (plan: {
        starterProfile: string;
        targetDirectory: string;
        domainFocus?: string;
      }) => Array<{ path: string; content: string }>;
    };

    const files = runner.buildReactBootstrapStarterFiles({
      starterProfile: "react-dashboard",
      targetDirectory: "generated-apps/finance-board",
      domainFocus: "finance"
    });

    assert.ok(files.some((file) => file.path === "src/App.tsx" && /collections|budget|finance/i.test(file.content)));
  });
});

test("AgentTaskRunner dashboard starter passes ui smoke for finance filter prompts", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      buildReactBootstrapStarterFiles: (plan: {
        starterProfile: string;
        targetDirectory: string;
        domainFocus?: string;
      }) => Array<{ path: string; content: string }>;
      verifyBasicUiSmoke: (plan: {
        workingDirectory: string;
        workspaceKind: "static" | "react" | "generic";
        builderMode: "notes" | "landing" | "dashboard" | "crud" | "kanban" | null;
        promptRequirements?: Array<{ id: string }>;
      }) => Promise<{ status: string; details: string }>;
    };

    const targetDirectory = "generated-apps/finance-board";
    const files = runner.buildReactBootstrapStarterFiles({
      starterProfile: "react-dashboard",
      targetDirectory,
      domainFocus: "finance"
    });

    await mkdir(join(workspaceRoot, targetDirectory, "src"), { recursive: true });
    for (const file of files) {
      await writeFile(join(workspaceRoot, targetDirectory, file.path), file.content, "utf8");
    }

    const result = await runner.verifyBasicUiSmoke({
      workingDirectory: targetDirectory,
      workspaceKind: "react",
      builderMode: "dashboard",
      promptRequirements: [{ id: "req-search-filter" }]
    });

    assert.equal(result.status, "passed");
  });
});

test("AgentTaskRunner applies inventory-specific CRUD starter copy when domain focus is inventory", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      buildReactBootstrapStarterFiles: (plan: {
        starterProfile: string;
        targetDirectory: string;
        domainFocus?: string;
      }) => Array<{ path: string; content: string }>;
    };

    const files = runner.buildReactBootstrapStarterFiles({
      starterProfile: "react-crud",
      targetDirectory: "generated-apps/stock-room",
      domainFocus: "inventory"
    });

    assert.ok(files.some((file) => file.path === "src/App.tsx" && /Inventory workspace|SKU|supplier/i.test(file.content)));
  });
});

test("AgentTaskRunner applies scheduling-specific desktop starter copy when domain focus is scheduling", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      buildReactBootstrapStarterFiles: (plan: {
        starterProfile: string;
        targetDirectory: string;
        domainFocus?: string;
      }) => Array<{ path: string; content: string }>;
    };

    const files = runner.buildReactBootstrapStarterFiles({
      starterProfile: "electron-desktop",
      targetDirectory: "generated-apps/dispatch-desk",
      domainFocus: "scheduling"
    });

    assert.ok(files.some((file) => file.path === "src/App.tsx" && /dispatch|booking|schedule/i.test(file.content)));
  });
});

test("AgentTaskRunner uses marketing sections in the static bootstrap starter", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      buildStaticBootstrapHtml: (projectName: string, starterProfile?: string) => string;
      buildStaticBootstrapCss: (starterProfile?: string) => string;
    };

    const html = runner.buildStaticBootstrapHtml("launch-board", "static-marketing");
    const css = runner.buildStaticBootstrapCss("static-marketing");

    assert.match(html, /feature-grid/);
    assert.match(html, /Start trial/);
    assert.match(css, /marketing-shell/);
  });
});

test("AgentTaskRunner uses richer API service starter content for node-package bootstrap", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      buildNodePackageStarterContent: (projectName: string, artifactType?: string, domainFocus?: string) => Array<{ path: string; content: string }>;
      buildNodePackageScripts: (artifactType?: string) => Record<string, string>;
    };

    const files = runner.buildNodePackageStarterContent("service-alpha", "api-service");
    const scripts = runner.buildNodePackageScripts("api-service");

    assert.ok(files.some((file) => file.path === "src/server.js" && /\/health/.test(file.content)));
    assert.ok(files.some((file) => file.path === "test/server.test.js"));
    assert.equal(scripts.test, "node --test");
  });
});

test("AgentTaskRunner applies domain-aware API starter resources for finance services", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      buildNodePackageStarterContent: (projectName: string, artifactType?: string, domainFocus?: string) => Array<{ path: string; content: string }>;
    };

    const files = runner.buildNodePackageStarterContent("billing-service", "api-service", "finance");

    assert.ok(files.some((file) => file.path === "src/server.js" && /\/invoices/.test(file.content)));
    assert.ok(files.some((file) => file.path === "src/server.js" && /customer/.test(file.content)));
  });
});

test("AgentTaskRunner shapes CLI bootstrap manifests and launcher files", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      buildNodePackageManifest: (projectName: string, artifactType?: string) => {
        bin?: Record<string, string>;
        scripts?: Record<string, string>;
      };
      buildNodePackageStarterContent: (projectName: string, artifactType?: string) => Array<{ path: string; content: string }>;
    };

    const manifest = runner.buildNodePackageManifest("audit-tool", "script-tool");
    const files = runner.buildNodePackageStarterContent("audit-tool", "script-tool");

    assert.equal(manifest.bin?.["audit-tool"], "./bin/cli.mjs");
    assert.equal(manifest.scripts?.start, "node src/index.js");
    assert.ok(files.some((file) => file.path === "bin/cli.mjs" && /import '\.\.\/src\/index\.js';/.test(file.content)));
  });
});

test("AgentTaskRunner shapes library bootstrap manifests with exports", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      buildNodePackageManifest: (projectName: string, artifactType?: string) => {
        main?: string;
        exports?: Record<string, string> | string;
        scripts?: Record<string, string>;
      };
      buildNodePackageStarterContent: (projectName: string, artifactType?: string) => Array<{ path: string; content: string }>;
    };

    const manifest = runner.buildNodePackageManifest("metrics-kit", "library");
    const files = runner.buildNodePackageStarterContent("metrics-kit", "library");

    assert.equal(manifest.main, "./src/index.js");
    assert.deepEqual(manifest.exports, { ".": "./src/index.js" });
    assert.equal(manifest.scripts?.test, "node --test");
    assert.ok(files.some((file) => file.path === "src/index.js" && /formatCompactCount|formatPercentDelta/.test(file.content)));
  });
});

test("AgentTaskRunner does not reuse react bootstrap directories when key Vite dependencies are missing", async () => {
  await withTempDir(async (workspaceRoot) => {
    await mkdir(join(workspaceRoot, "generated-apps", "react-smoke", "src"), { recursive: true });
    await writeFile(join(workspaceRoot, "generated-apps", "react-smoke", "package.json"), "{\"name\":\"react-smoke\"}\n", "utf8");
    await writeFile(join(workspaceRoot, "generated-apps", "react-smoke", "src", "main.tsx"), "export {}\n", "utf8");
    await writeFile(join(workspaceRoot, "generated-apps", "react-smoke", "src", "App.tsx"), "export default function App() { return null; }\n", "utf8");

    const runner = createRunner(workspaceRoot) as never as {
      isReusableBootstrapDirectory: (plan: {
        template: "react-vite" | "static" | "nextjs" | "node-package";
        targetDirectory: string;
        artifactType?: string;
      }) => Promise<boolean>;
    };

    const reusable = await runner.isReusableBootstrapDirectory({
      template: "react-vite",
      targetDirectory: "generated-apps/react-smoke"
    });

    assert.equal(reusable, false);
  });
});

test("AgentTaskRunner inlines the board title in heuristic kanban React output", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      buildKanbanBoardTsx: (title: string) => string;
    };

    const content = runner.buildKanbanBoardTsx("Sprint Board");

    assert.match(content, /<h1>Sprint Board<\/h1>/);
    assert.doesNotMatch(content, /<h1>\{title\}<\/h1>/);
  });
});

test("AgentTaskRunner uses script-tool allowlists for generic tool prompts", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      buildTaskWorkItems: (
        prompt: string,
        workingDirectory: string,
        workspaceKind: "static" | "react" | "generic",
        requestedPaths?: string[]
      ) => Array<{ allowedPaths?: string[] }>;
    };

    const items = runner.buildTaskWorkItems(
      "[SOAK:tool.markdown-cli] Create a command-line tool that reads a markdown file and prints a compact section summary to the terminal.",
      "generated-apps/markdown-cli",
      "generic",
      []
    );

    const allowed = new Set(items.flatMap((item) => item.allowedPaths ?? []));
    assert.ok(allowed.has("generated-apps/markdown-cli/package.json"));
    assert.ok(allowed.has("generated-apps/markdown-cli/src/index.js"));
    assert.equal(allowed.has("generated-apps/markdown-cli/src/App.tsx"), false);
  });
});

test("AgentTaskRunner verifies explicitly requested files even in react workspaces", async () => {
  await withTempDir(async (workspaceRoot) => {
    await mkdir(join(workspaceRoot, "generated-apps/agent-smoke/src"), { recursive: true });
    await writeFile(join(workspaceRoot, "generated-apps/agent-smoke/package.json"), "{}\n", "utf8");
    await writeFile(join(workspaceRoot, "generated-apps/agent-smoke/src/main.tsx"), "export {};\n", "utf8");
    await writeFile(join(workspaceRoot, "generated-apps/agent-smoke/src/App.tsx"), "export function App() { return null; }\n", "utf8");

    const runner = createRunner(workspaceRoot) as never as {
      verifyExpectedEntryFiles: (
        plan: {
          workingDirectory: string;
          workspaceKind: "static" | "react" | "generic";
          requestedPaths: string[];
        },
        artifactType: string
      ) => Promise<{ status: string; details: string }>;
    };

    const result = await runner.verifyExpectedEntryFiles({
      workingDirectory: "generated-apps/agent-smoke",
      workspaceKind: "react",
      requestedPaths: [
        "generated-apps/agent-smoke/index.html",
        "generated-apps/agent-smoke/styles.css",
        "generated-apps/agent-smoke/app.js"
      ]
    }, "web-app");

    assert.equal(result.status, "failed");
    assert.match(result.details, /styles\.css/);
    assert.match(result.details, /app\.js/);
  });
});

test("AgentTaskRunner accepts legacy desktop filename requests when the modern electron react scaffold exists", async () => {
  await withTempDir(async (workspaceRoot) => {
    await mkdir(join(workspaceRoot, "generated-apps/desktop-smoke/src"), { recursive: true });
    await mkdir(join(workspaceRoot, "generated-apps/desktop-smoke/electron"), { recursive: true });
    await mkdir(join(workspaceRoot, "generated-apps/desktop-smoke/scripts"), { recursive: true });
    await writeFile(join(workspaceRoot, "generated-apps/desktop-smoke/package.json"), "{}\n", "utf8");
    await writeFile(join(workspaceRoot, "generated-apps/desktop-smoke/index.html"), "<!doctype html>\n", "utf8");
    await writeFile(join(workspaceRoot, "generated-apps/desktop-smoke/src/main.tsx"), "export {};\n", "utf8");
    await writeFile(join(workspaceRoot, "generated-apps/desktop-smoke/src/App.tsx"), "export function App() { return null; }\n", "utf8");
    await writeFile(join(workspaceRoot, "generated-apps/desktop-smoke/src/App.css"), ".app{}\n", "utf8");
    await writeFile(join(workspaceRoot, "generated-apps/desktop-smoke/src/index.css"), ":root{}\n", "utf8");
    await writeFile(join(workspaceRoot, "generated-apps/desktop-smoke/electron/main.mjs"), "export {};\n", "utf8");
    await writeFile(join(workspaceRoot, "generated-apps/desktop-smoke/electron/preload.mjs"), "export {};\n", "utf8");
    await writeFile(join(workspaceRoot, "generated-apps/desktop-smoke/scripts/desktop-launch.mjs"), "console.log('launch');\n", "utf8");

    const runner = createRunner(workspaceRoot) as never as {
      verifyExpectedEntryFiles: (
        plan: {
          workingDirectory: string;
          workspaceKind: "static" | "react" | "generic";
          requestedPaths: string[];
        },
        artifactType: string
      ) => Promise<{ status: string; details: string }>;
    };

    const result = await runner.verifyExpectedEntryFiles({
      workingDirectory: "generated-apps/desktop-smoke",
      workspaceKind: "react",
      requestedPaths: [
        "generated-apps/desktop-smoke/main.js",
        "generated-apps/desktop-smoke/preload.js",
        "generated-apps/desktop-smoke/renderer.js",
        "generated-apps/desktop-smoke/styles.css"
      ]
    }, "desktop-app");

    assert.equal(result.status, "passed");
    assert.match(result.details, /generated-apps\/desktop-smoke\/main\.js/);
    assert.match(result.details, /generated-apps\/desktop-smoke\/styles\.css/);
  });
});

test("AgentTaskRunner retries Windows desktop packaging after transient app.asar lock failures", async () => {
  await withTempDir(async (workspaceRoot) => {
    await mkdir(join(workspaceRoot, "generated-apps/desktop-smoke/release/win-unpacked/resources"), { recursive: true });
    await writeFile(join(workspaceRoot, "generated-apps/desktop-smoke/release/win-unpacked/resources/app.asar"), "stale", "utf8");

    const runner = createRunner(workspaceRoot) as never as {
      verifyWindowsDesktopPackaging: (
        taskId: string,
        plan: { workingDirectory: string },
        scripts: Record<string, string>
      ) => Promise<{ status: string; details: string }>;
      executeCommand: (taskId: string, request: { command: string; args?: string[]; cwd?: string; timeoutMs?: number }) => Promise<{
        ok: boolean;
        combinedOutput: string;
        stdout: string;
        stderr: string;
      }>;
    };

    let attempts = 0;
    runner.executeCommand = async (_taskId, request) => {
      if (!/npm(?:\.cmd)?$/i.test(request.command)) {
        return {
          ok: true,
          combinedOutput: "",
          stdout: "",
          stderr: ""
        };
      }

      attempts += 1;
      if (attempts === 1) {
        return {
          ok: false,
          combinedOutput: "Error: EPERM: operation not permitted, unlink 'D:\\\\tmp\\\\desktop-smoke\\\\release\\\\win-unpacked\\\\resources\\\\app.asar'",
          stdout: "",
          stderr: "EPERM unlink app.asar"
        };
      }

      await mkdir(join(workspaceRoot, "generated-apps/desktop-smoke/release"), { recursive: true });
      await writeFile(join(workspaceRoot, "generated-apps/desktop-smoke/release/desktop-smoke Setup.exe"), "installer", "utf8");
      return {
        ok: true,
        combinedOutput: "packaging complete",
        stdout: "packaging complete",
        stderr: ""
      };
    };

    const result = await runner.verifyWindowsDesktopPackaging(
      "task-1",
      { workingDirectory: "generated-apps/desktop-smoke" },
      { "package:win": "electron-builder --win" }
    );

    assert.equal(attempts, 2);
    assert.equal(result.status, "passed");
    assert.match(result.details, /desktop-smoke Setup\.exe/);
    await assert.rejects(
      () => readFile(join(workspaceRoot, "generated-apps/desktop-smoke/release/win-unpacked/resources/app.asar"), "utf8")
    );
  });
});

test("AgentTaskRunner falls back to isolated packaging output after repeated transient lock failures", async () => {
  await withTempDir(async (workspaceRoot) => {
    await mkdir(join(workspaceRoot, "generated-apps/desktop-smoke/release/win-unpacked/resources"), { recursive: true });
    await writeFile(join(workspaceRoot, "generated-apps/desktop-smoke/release/win-unpacked/resources/app.asar"), "stale", "utf8");

    const runner = createRunner(workspaceRoot) as never as {
      verifyWindowsDesktopPackaging: (
        taskId: string,
        plan: { workingDirectory: string },
        scripts: Record<string, string>
      ) => Promise<{ status: string; details: string }>;
      executeCommand: (taskId: string, request: { command: string; args?: string[]; cwd?: string; timeoutMs?: number }) => Promise<{
        ok: boolean;
        combinedOutput: string;
        stdout: string;
        stderr: string;
      }>;
    };

    let npmScriptAttempts = 0;
    let isolatedFallbackAttempts = 0;
    runner.executeCommand = async (_taskId, request) => {
      if (!/npm(?:\.cmd)?$/i.test(request.command)) {
        return {
          ok: true,
          combinedOutput: "",
          stdout: "",
          stderr: ""
        };
      }

      if ((request.args ?? []).includes("exec")) {
        isolatedFallbackAttempts += 1;
        const outputArg = (request.args ?? []).find((arg) => arg.startsWith("--config.directories.output=")) ?? "";
        const outputDirectory = outputArg.replace("--config.directories.output=", "") || "release-package-test";
        await mkdir(join(workspaceRoot, "generated-apps/desktop-smoke", outputDirectory), { recursive: true });
        await writeFile(join(workspaceRoot, "generated-apps/desktop-smoke", outputDirectory, "desktop-smoke Setup.exe"), "installer", "utf8");
        return {
          ok: true,
          combinedOutput: "isolated packaging complete",
          stdout: "isolated packaging complete",
          stderr: ""
        };
      }

      npmScriptAttempts += 1;
      return {
        ok: false,
        combinedOutput: "Error: EPERM: operation not permitted, unlink 'D:\\\\tmp\\\\desktop-smoke\\\\release\\\\win-unpacked\\\\resources\\\\app.asar'",
        stdout: "",
        stderr: "EPERM unlink app.asar"
      };
    };

    const result = await runner.verifyWindowsDesktopPackaging(
      "task-1",
      { workingDirectory: "generated-apps/desktop-smoke" },
      { "package:win": "electron-builder --win nsis --publish never" }
    );

    assert.equal(npmScriptAttempts, 3);
    assert.equal(isolatedFallbackAttempts, 1);
    assert.equal(result.status, "passed");
    assert.match(result.details, /release-package-[^/]+\/desktop-smoke Setup\.exe/);
  });
});

test("AgentTaskRunner fails UI smoke for starter placeholder desktop shells", async () => {
  await withTempDir(async (workspaceRoot) => {
    await mkdir(join(workspaceRoot, "generated-apps/desktop-shell/src"), { recursive: true });
    await writeFile(join(workspaceRoot, "generated-apps/desktop-shell/src/App.tsx"), `
      export default function App() {
        return (
          <main>
            <h1>Youtube Video Summarizer Pro</h1>
            <button type="button">Open primary action</button>
            <section>
              <h2>Focused desktop shell</h2>
              <p>Replace this starter shell with the real product workflow.</p>
            </section>
          </main>
        );
      }
    `, "utf8");
    await writeFile(join(workspaceRoot, "generated-apps/desktop-shell/src/main.tsx"), "export {};\n", "utf8");
    await writeFile(join(workspaceRoot, "generated-apps/desktop-shell/index.html"), "<!doctype html><div id=\"root\"></div>\n", "utf8");

    const runner = createRunner(workspaceRoot) as never as {
      verifyBasicUiSmoke: (
        plan: {
          workingDirectory: string;
          workspaceKind: "static" | "react" | "generic";
          builderMode: "notes" | "landing" | "dashboard" | "crud" | "kanban" | null;
          promptRequirements: Array<{ id: string }>;
        }
      ) => Promise<{ status: string; details: string }>;
    };

    const result = await runner.verifyBasicUiSmoke({
      workingDirectory: "generated-apps/desktop-shell",
      workspaceKind: "react",
      builderMode: null,
      promptRequirements: [{ id: "req-summary" }]
    });

    assert.equal(result.status, "failed");
    assert.match(result.details, /starter placeholder markers/i);
    assert.match(result.details, /open primary action/i);
  });
});

test("AgentTaskRunner fails verification when static workspaces contain React scaffold leftovers", async () => {
  await withTempDir(async (workspaceRoot) => {
    await mkdir(join(workspaceRoot, "generated-apps/agent-smoke/src"), { recursive: true });
    await writeFile(join(workspaceRoot, "generated-apps/agent-smoke/index.html"), "<!doctype html>\n", "utf8");
    await writeFile(join(workspaceRoot, "generated-apps/agent-smoke/styles.css"), "body {}\n", "utf8");
    await writeFile(join(workspaceRoot, "generated-apps/agent-smoke/app.js"), "console.log('ok');\n", "utf8");
    await writeFile(join(workspaceRoot, "generated-apps/agent-smoke/src/App.tsx"), "export default function App() { return null; }\n", "utf8");

    const runner = createRunner(workspaceRoot) as never as {
      verifyExpectedEntryFiles: (
        plan: {
          workingDirectory: string;
          workspaceKind: "static" | "react" | "generic";
          requestedPaths: string[];
        },
        artifactType: string
      ) => Promise<{ status: string; details: string }>;
    };

    const result = await runner.verifyExpectedEntryFiles({
      workingDirectory: "generated-apps/agent-smoke",
      workspaceKind: "static",
      requestedPaths: []
    }, "web-app");

    assert.equal(result.status, "failed");
    assert.match(result.details, /Conflicting static scaffold files found/i);
    assert.match(result.details, /src\/App\.tsx/i);
  });
});

test("AgentTaskRunner prunes conflicting React scaffold files from generated static apps", async () => {
  await withTempDir(async (workspaceRoot) => {
    await mkdir(join(workspaceRoot, "generated-apps/agent-smoke/src"), { recursive: true });
    await writeFile(join(workspaceRoot, "generated-apps/agent-smoke/index.html"), "<!doctype html>\n", "utf8");
    await writeFile(join(workspaceRoot, "generated-apps/agent-smoke/styles.css"), "body {}\n", "utf8");
    await writeFile(join(workspaceRoot, "generated-apps/agent-smoke/app.js"), "console.log('ok');\n", "utf8");
    await writeFile(join(workspaceRoot, "generated-apps/agent-smoke/src/App.tsx"), "export default function App() { return null; }\n", "utf8");
    await writeFile(join(workspaceRoot, "generated-apps/agent-smoke/vite.config.ts"), "export default {};\n", "utf8");

    const runner = createRunner(workspaceRoot) as never as {
      pruneUnexpectedGeneratedAppFiles: (
        taskId: string,
        plan: {
          workingDirectory: string;
          workspaceKind: "static" | "react" | "generic";
          candidateFiles: string[];
        }
      ) => Promise<string[]>;
      pathExists: (path: string) => Promise<boolean>;
      resolveWorkspacePath: (path: string) => string;
    };

    const removed = await runner.pruneUnexpectedGeneratedAppFiles("task-1", {
      workingDirectory: "generated-apps/agent-smoke",
      workspaceKind: "static",
      candidateFiles: [
        "generated-apps/agent-smoke/index.html",
        "generated-apps/agent-smoke/styles.css",
        "generated-apps/agent-smoke/app.js",
        "generated-apps/agent-smoke/package.json"
      ]
    });

    assert.deepEqual(removed.sort(), [
      "generated-apps/agent-smoke/src/App.tsx",
      "generated-apps/agent-smoke/vite.config.ts"
    ]);
    assert.equal(await runner.pathExists(runner.resolveWorkspacePath("generated-apps/agent-smoke/src/App.tsx")), false);
    assert.equal(await runner.pathExists(runner.resolveWorkspacePath("generated-apps/agent-smoke/vite.config.ts")), false);
  });
});

test("AgentTaskRunner keeps notes work item allowlists aligned to static scaffolds", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      buildTaskWorkItems: (
        prompt: string,
        workingDirectory: string,
        workspaceKind: "static" | "react" | "generic",
        requestedPaths?: string[]
      ) => Array<{ allowedPaths?: string[] }>;
    };

    const items = runner.buildTaskWorkItems(
      "Create a static notes app with index.html, styles.css, and app.js.",
      "generated-apps/agent-smoke",
      "static",
      [
        "generated-apps/agent-smoke/index.html",
        "generated-apps/agent-smoke/styles.css",
        "generated-apps/agent-smoke/app.js"
      ]
    );

    const allowed = new Set(items.flatMap((item) => item.allowedPaths ?? []));
    assert.ok(allowed.has("generated-apps/agent-smoke/index.html"));
    assert.ok(allowed.has("generated-apps/agent-smoke/styles.css"));
    assert.ok(allowed.has("generated-apps/agent-smoke/app.js"));
    assert.equal(allowed.has("generated-apps/agent-smoke/src/App.tsx"), false);
  });
});

test("AgentTaskRunner passes UI smoke for static notes apps with heading, action, and input flow", async () => {
  await withTempDir(async (workspaceRoot) => {
    await mkdir(join(workspaceRoot, "generated-apps/agent-smoke"), { recursive: true });
    await writeFile(join(workspaceRoot, "generated-apps/agent-smoke/index.html"), `
      <!doctype html>
      <html>
        <body>
          <main>
            <h1>Notes</h1>
            <form>
              <input />
              <textarea></textarea>
              <button type="submit">Save</button>
            </form>
            <ul class="notes-list"></ul>
          </main>
        </body>
      </html>
    `, "utf8");
    await writeFile(join(workspaceRoot, "generated-apps/agent-smoke/app.js"), `
      const notes = [];
      const form = document.querySelector("form");
      const list = document.querySelector(".notes-list");
      const renderNotes = () => {
        list.replaceChildren(...notes.map((note) => {
          const item = document.createElement("li");
          item.textContent = note;
          return item;
        }));
      };
      form?.addEventListener("submit", (event) => {
        event.preventDefault();
        notes.push("New note");
        renderNotes();
      });
    `, "utf8");

    const runner = createRunner(workspaceRoot) as never as {
      verifyBasicUiSmoke: (
        plan: {
          workingDirectory: string;
          workspaceKind: "static" | "react" | "generic";
          builderMode: "notes" | "landing" | "dashboard" | "crud" | null;
        }
      ) => Promise<{ status: string; details: string }>;
    };

    const result = await runner.verifyBasicUiSmoke({
      workingDirectory: "generated-apps/agent-smoke",
      workspaceKind: "static",
      builderMode: "notes"
    });

    assert.equal(result.status, "passed");
    assert.match(result.details, /input flow/i);
    assert.match(result.details, /stateful flow/i);
    assert.match(result.details, /notes persistence flow/i);
  });
});

test("AgentTaskRunner does not reuse desktop bootstrap directories when package:win is missing", async () => {
  await withTempDir(async (workspaceRoot) => {
    await mkdir(join(workspaceRoot, "generated-apps", "desktop-smoke", "src"), { recursive: true });
    await mkdir(join(workspaceRoot, "generated-apps", "desktop-smoke", "electron"), { recursive: true });
    await mkdir(join(workspaceRoot, "generated-apps", "desktop-smoke", "scripts"), { recursive: true });
    await mkdir(join(workspaceRoot, "generated-apps", "desktop-smoke", "node_modules", "@vitejs", "plugin-react"), { recursive: true });
    await mkdir(join(workspaceRoot, "generated-apps", "desktop-smoke", "node_modules", "vite"), { recursive: true });
    await mkdir(join(workspaceRoot, "generated-apps", "desktop-smoke", "node_modules", "react"), { recursive: true });
    await writeFile(join(workspaceRoot, "generated-apps", "desktop-smoke", "package.json"), JSON.stringify({
      name: "desktop-smoke",
      scripts: {
        start: "node scripts/desktop-launch.mjs",
        build: "vite build"
      }
    }, null, 2) + "\n", "utf8");
    await writeFile(join(workspaceRoot, "generated-apps", "desktop-smoke", "index.html"), "<!doctype html><div id=\"root\"></div>\n", "utf8");
    await writeFile(join(workspaceRoot, "generated-apps", "desktop-smoke", "src", "main.tsx"), "export {}\n", "utf8");
    await writeFile(join(workspaceRoot, "generated-apps", "desktop-smoke", "src", "App.tsx"), "export default function App() { return null; }\n", "utf8");
    await writeFile(join(workspaceRoot, "generated-apps", "desktop-smoke", "electron", "main.mjs"), "export {}\n", "utf8");
    await writeFile(join(workspaceRoot, "generated-apps", "desktop-smoke", "scripts", "desktop-launch.mjs"), "console.log('launch');\n", "utf8");
    await writeFile(join(workspaceRoot, "generated-apps", "desktop-smoke", "node_modules", "@vitejs", "plugin-react", "package.json"), "{\"name\":\"@vitejs/plugin-react\"}\n", "utf8");
    await writeFile(join(workspaceRoot, "generated-apps", "desktop-smoke", "node_modules", "vite", "package.json"), "{\"name\":\"vite\"}\n", "utf8");
    await writeFile(join(workspaceRoot, "generated-apps", "desktop-smoke", "node_modules", "react", "package.json"), "{\"name\":\"react\"}\n", "utf8");

    const runner = createRunner(workspaceRoot) as never as {
      isReusableBootstrapDirectory: (plan: {
        template: "react-vite" | "static" | "nextjs" | "node-package";
        targetDirectory: string;
        artifactType?: string;
        starterProfile?: string;
      }) => Promise<boolean>;
    };

    const reusable = await runner.isReusableBootstrapDirectory({
      template: "react-vite",
      targetDirectory: "generated-apps/desktop-smoke",
      artifactType: "desktop-app",
      starterProfile: "electron-desktop"
    });

    assert.equal(reusable, false);
  });
});

test("AgentTaskRunner accepts desktop recovery edits for implicit react and electron scaffold files", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      filterValidEdits: (
        edits: Array<{ path: string; content: string }>,
        plan?: {
          workingDirectory: string;
          workspaceKind: "react" | "static" | "generic";
          candidateFiles: string[];
          requestedPaths?: string[];
          spec?: { starterProfile?: string; requiredFiles?: string[] };
        }
      ) => Array<{ path: string; content: string }>;
    };

    const accepted = runner.filterValidEdits(
      [
        { path: "generated-apps/youtube-video-summarizer-pro/src/App.css", content: ".app{}\n" },
        { path: "generated-apps/youtube-video-summarizer-pro/src/index.css", content: ":root{}\n" },
        { path: "generated-apps/youtube-video-summarizer-pro/scripts/desktop-launch.mjs", content: "console.log('launch')\n" }
      ],
      {
        workingDirectory: "generated-apps/youtube-video-summarizer-pro",
        workspaceKind: "react",
        candidateFiles: [
          "generated-apps/youtube-video-summarizer-pro/package.json",
          "generated-apps/youtube-video-summarizer-pro/index.html",
          "generated-apps/youtube-video-summarizer-pro/src/App.tsx"
        ],
        requestedPaths: [],
        spec: {
          starterProfile: "electron-desktop",
          requiredFiles: [
            "generated-apps/youtube-video-summarizer-pro/package.json",
            "generated-apps/youtube-video-summarizer-pro/index.html",
            "generated-apps/youtube-video-summarizer-pro/src/main.tsx",
            "generated-apps/youtube-video-summarizer-pro/src/App.tsx",
            "generated-apps/youtube-video-summarizer-pro/electron/main.mjs",
            "generated-apps/youtube-video-summarizer-pro/scripts/desktop-launch.mjs"
          ]
        }
      }
    );

    assert.deepEqual(
      accepted.map((item) => item.path),
      [
        "generated-apps/youtube-video-summarizer-pro/src/App.css",
        "generated-apps/youtube-video-summarizer-pro/src/index.css",
        "generated-apps/youtube-video-summarizer-pro/scripts/desktop-launch.mjs"
      ]
    );
  });
});

test("AgentTaskRunner fails UI smoke when expected input flow is missing", async () => {
  await withTempDir(async (workspaceRoot) => {
    await mkdir(join(workspaceRoot, "generated-apps/agent-smoke"), { recursive: true });
    await writeFile(join(workspaceRoot, "generated-apps/agent-smoke/index.html"), `
      <!doctype html>
      <html>
        <body>
          <main>
            <h1>Notes</h1>
            <button type="button">Open</button>
          </main>
        </body>
      </html>
    `, "utf8");

    const runner = createRunner(workspaceRoot) as never as {
      verifyBasicUiSmoke: (
        plan: {
          workingDirectory: string;
          workspaceKind: "static" | "react" | "generic";
          builderMode: "notes" | "landing" | "dashboard" | "crud" | null;
        }
      ) => Promise<{ status: string; details: string }>;
    };

    const result = await runner.verifyBasicUiSmoke({
      workingDirectory: "generated-apps/agent-smoke",
      workspaceKind: "static",
      builderMode: "notes"
    });

    assert.equal(result.status, "failed");
    assert.match(result.details, /data-entry flow/i);
  });
});

test("AgentTaskRunner fails UI smoke when interactive inputs do not show stateful save markers", async () => {
  await withTempDir(async (workspaceRoot) => {
    await mkdir(join(workspaceRoot, "generated-apps/agent-smoke"), { recursive: true });
    await writeFile(join(workspaceRoot, "generated-apps/agent-smoke/index.html"), `
      <!doctype html>
      <html>
        <body>
          <main>
            <h1>Notes</h1>
            <form>
              <input />
              <textarea></textarea>
              <button type="submit">Save</button>
            </form>
            <section class="empty-state">Nothing saved yet.</section>
          </main>
        </body>
      </html>
    `, "utf8");
    await writeFile(join(workspaceRoot, "generated-apps/agent-smoke/app.js"), `
      const form = document.querySelector("form");
      form?.addEventListener("submit", (event) => {
        event.preventDefault();
      });
    `, "utf8");

    const runner = createRunner(workspaceRoot) as never as {
      verifyBasicUiSmoke: (
        plan: {
          workingDirectory: string;
          workspaceKind: "static" | "react" | "generic";
          builderMode: "notes" | "landing" | "dashboard" | "crud" | null;
        }
      ) => Promise<{ status: string; details: string }>;
    };

    const result = await runner.verifyBasicUiSmoke({
      workingDirectory: "generated-apps/agent-smoke",
      workspaceKind: "static",
      builderMode: "notes"
    });

    assert.equal(result.status, "failed");
    assert.match(result.details, /stateful save\/update flow/i);
  });
});

test("AgentTaskRunner fails notes UI smoke when note persistence markers are missing", async () => {
  await withTempDir(async (workspaceRoot) => {
    await mkdir(join(workspaceRoot, "generated-apps/agent-smoke"), { recursive: true });
    await writeFile(join(workspaceRoot, "generated-apps/agent-smoke/index.html"), `
      <!doctype html>
      <html>
        <body>
          <main>
            <h1>Workspace</h1>
            <form>
              <input />
              <textarea></textarea>
              <button type="submit">Save</button>
            </form>
            <ul id="items"></ul>
          </main>
        </body>
      </html>
    `, "utf8");
    await writeFile(join(workspaceRoot, "generated-apps/agent-smoke/app.js"), `
      const items = [];
      const form = document.querySelector("form");
      const list = document.getElementById("items");
      const render = () => {
        list.replaceChildren(...items.map((item) => {
          const el = document.createElement("li");
          el.textContent = item;
          return el;
        }));
      };
      form?.addEventListener("submit", (event) => {
        event.preventDefault();
        items.push("Saved item");
        render();
      });
    `, "utf8");

    const runner = createRunner(workspaceRoot) as never as {
      verifyBasicUiSmoke: (
        plan: {
          workingDirectory: string;
          workspaceKind: "static" | "react" | "generic";
          builderMode: "notes" | "landing" | "dashboard" | "crud" | "kanban" | null;
        }
      ) => Promise<{ status: string; details: string }>;
    };

    const result = await runner.verifyBasicUiSmoke({
      workingDirectory: "generated-apps/agent-smoke",
      workspaceKind: "static",
      builderMode: "notes"
    });

    assert.equal(result.status, "failed");
    assert.match(result.details, /note persistence markers/i);
  });
});

test("AgentTaskRunner accepts kanban boards as stateful collection views", async () => {
  await withTempDir(async (workspaceRoot) => {
    await mkdir(join(workspaceRoot, "generated-apps/agent-smoke/src"), { recursive: true });
    await writeFile(join(workspaceRoot, "generated-apps/agent-smoke/src/App.tsx"), `
      import { FormEvent, useState } from "react";

      type LaneId = "todo" | "progress" | "done";
      type Card = { id: number; title: string; lane: LaneId };

      export default function App() {
        const [cards, setCards] = useState<Card[]>([{ id: 1, title: "Draft launch plan", lane: "todo" }]);
        const [draft, setDraft] = useState("");

        function addTask(event: FormEvent) {
          event.preventDefault();
          const title = draft.trim();
          if (!title) return;
          setCards((current) => [...current, { id: Date.now(), title, lane: "todo" }]);
          setDraft("");
        }

        return (
          <main>
            <h1>Team kanban board</h1>
            <form onSubmit={addTask}>
              <input value={draft} onChange={(event) => setDraft(event.target.value)} />
              <button type="submit">Add task</button>
            </form>
            <section className="kanban-grid">
              <article className="kanban-lane">
                <div className="kanban-cards">
                  {cards.map((card) => (
                    <div key={card.id} className="kanban-card">{card.title}</div>
                  ))}
                </div>
              </article>
            </section>
          </main>
        );
      }
    `, "utf8");

    const runner = createRunner(workspaceRoot) as never as {
      verifyBasicUiSmoke: (
        plan: {
          workingDirectory: string;
          workspaceKind: "static" | "react" | "generic";
          builderMode: "notes" | "landing" | "dashboard" | "crud" | "kanban" | null;
        }
      ) => Promise<{ status: string; details: string }>;
    };

    const result = await runner.verifyBasicUiSmoke({
      workingDirectory: "generated-apps/agent-smoke",
      workspaceKind: "react",
      builderMode: "kanban"
    });

    assert.equal(result.status, "passed");
    assert.match(result.details, /input flow/i);
    assert.match(result.details, /stateful flow/i);
  });
});

test("AgentTaskRunner repairs failed CRUD UI smoke with a heuristic app fallback", async () => {
  await withTempDir(async (workspaceRoot) => {
    await mkdir(join(workspaceRoot, "generated-apps/small-internal-tool/src"), { recursive: true });
    await writeFile(join(workspaceRoot, "generated-apps/small-internal-tool/package.json"), JSON.stringify({
      name: "small-internal-tool",
      version: "0.1.0",
      private: true,
      scripts: {
        build: "echo build"
      }
    }, null, 2), "utf8");
    await writeFile(join(workspaceRoot, "generated-apps/small-internal-tool/src/App.tsx"), `
      import { useState } from "react";

      export default function App() {
        const [count, setCount] = useState(0);
        return (
          <main>
            <h1>Get started</h1>
            <button type="button" onClick={() => setCount((current) => current + 1)}>
              Count is {count}
            </button>
          </main>
        );
      }
    `, "utf8");
    await writeFile(join(workspaceRoot, "generated-apps/small-internal-tool/src/main.tsx"), `
      import React from "react";
      import ReactDOM from "react-dom/client";
      import App from "./App";

      ReactDOM.createRoot(document.getElementById("root")!).render(
        <React.StrictMode>
          <App />
        </React.StrictMode>
      );
    `, "utf8");
    await writeFile(join(workspaceRoot, "generated-apps/small-internal-tool/src/App.css"), "body { margin: 0; }\n", "utf8");
    await writeFile(join(workspaceRoot, "generated-apps/small-internal-tool/src/index.css"), ":root { font-family: sans-serif; }\n", "utf8");

    const runner = createRunner(workspaceRoot) as never as {
      tryAutoFixUiSmoke: (
        task: {
          id: string;
          prompt: string;
          status: "running";
          createdAt: string;
          updatedAt: string;
          summary: string;
          steps: Array<unknown>;
          telemetry: { fallbackUsed: boolean; modelAttempts: unknown[] };
        },
        check: { id: string; label: string; status: "failed"; details: string },
        plan: {
          summary: string;
          candidateFiles: string[];
          requestedPaths: string[];
          promptTerms: string[];
          workingDirectory: string;
          workspaceManifest: string[];
          workItems: Array<unknown>;
          promptRequirements: Array<unknown>;
          workspaceKind: "react";
          builderMode: "crud";
        },
        scripts: { build?: string; lint?: string; test?: string },
        buildLabel: string,
        lintLabel: string,
        testLabel: string
      ) => Promise<boolean>;
      verifyBasicUiSmoke: (
        plan: {
          workingDirectory: string;
          workspaceKind: "static" | "react" | "generic";
          builderMode: "notes" | "landing" | "dashboard" | "crud" | "kanban" | null;
        }
      ) => Promise<{ status: string; details: string }>;
      readWorkspaceFile: (path: string) => Promise<{ content: string }>;
    };

    const now = new Date().toISOString();
    const task = {
      id: "task-1",
      prompt: "Build a small internal tool for tracking vendor payments. I need a table of vendors, payment status, due dates, and a quick way to mark one paid.",
      status: "running" as const,
      createdAt: now,
      updatedAt: now,
      summary: "",
      steps: [],
      telemetry: {
        fallbackUsed: false,
        modelAttempts: []
      }
    };

    const repaired = await runner.tryAutoFixUiSmoke(
      task,
      {
        id: "ui-smoke",
        label: "UI smoke",
        status: "failed",
        details: "Expected data-entry flow markers were not detected for this app type."
      },
      {
        summary: "Vendor payments app",
        candidateFiles: [
          "generated-apps/small-internal-tool/package.json",
          "generated-apps/small-internal-tool/src/App.tsx",
          "generated-apps/small-internal-tool/src/main.tsx",
          "generated-apps/small-internal-tool/src/App.css",
          "generated-apps/small-internal-tool/src/index.css"
        ],
        requestedPaths: [],
        promptTerms: [],
        workingDirectory: "generated-apps/small-internal-tool",
        workspaceManifest: [],
        workItems: [],
        promptRequirements: [],
        workspaceKind: "react",
        builderMode: "crud"
      },
      {},
      "Web build",
      "Web lint",
      "Web tests"
    );

    assert.equal(repaired, true);
    const appSource = await runner.readWorkspaceFile("generated-apps/small-internal-tool/src/App.tsx");
    assert.match(appSource.content, /Mark paid/i);

    const result = await runner.verifyBasicUiSmoke({
      workingDirectory: "generated-apps/small-internal-tool",
      workspaceKind: "react",
      builderMode: "crud"
    });

    assert.equal(result.status, "passed");
    assert.match(result.details, /stateful flow/i);
    assert.match(result.details, /crud mutation flow/i);
  });
});

test("AgentTaskRunner fails CRUD UI smoke when record mutation markers are missing", async () => {
  await withTempDir(async (workspaceRoot) => {
    await mkdir(join(workspaceRoot, "generated-apps", "crud-smoke", "src"), { recursive: true });
    await writeFile(join(workspaceRoot, "generated-apps", "crud-smoke", "src", "App.tsx"), `
      import { FormEvent, useState } from "react";

      export default function App() {
        const [records, setRecords] = useState([{ id: 1, name: "Alpha" }]);
        const [draft, setDraft] = useState("");

        function handleSubmit(event: FormEvent) {
          event.preventDefault();
          const value = draft.trim();
          if (!value) return;
          setRecords((current) => [{ id: Date.now(), name: value }, ...current]);
          setDraft("");
        }

        return (
          <main>
            <h1>Record manager</h1>
            <form onSubmit={handleSubmit}>
              <input value={draft} onChange={(event) => setDraft(event.target.value)} />
              <button type="submit">Add record</button>
            </form>
            <section>
              {records.map((record) => <article key={record.id} className="record-row">{record.name}</article>)}
            </section>
          </main>
        );
      }
    `, "utf8");

    const runner = createRunner(workspaceRoot) as never as {
      verifyBasicUiSmoke: (
        plan: {
          workingDirectory: string;
          workspaceKind: "static" | "react" | "generic";
          builderMode: "notes" | "landing" | "dashboard" | "crud" | "kanban" | null;
        }
      ) => Promise<{ status: string; details: string }>;
    };

    const result = await runner.verifyBasicUiSmoke({
      workingDirectory: "generated-apps/crud-smoke",
      workspaceKind: "react",
      builderMode: "crud"
    });

    assert.equal(result.status, "failed");
    assert.match(result.details, /crud mutation markers/i);
  });
});

test("AgentTaskRunner fails preview health when a static app does not load app.js", async () => {
  await withTempDir(async (workspaceRoot) => {
    await mkdir(join(workspaceRoot, "generated-apps/agent-smoke"), { recursive: true });
    await writeFile(join(workspaceRoot, "generated-apps/agent-smoke/index.html"), `
      <!doctype html>
      <html>
        <head><link rel="stylesheet" href="./styles.css" /></head>
        <body><main><h1>Notes</h1></main></body>
      </html>
    `, "utf8");
    await writeFile(join(workspaceRoot, "generated-apps/agent-smoke/styles.css"), "body { margin: 0; }\n", "utf8");
    await writeFile(join(workspaceRoot, "generated-apps/agent-smoke/app.js"), "console.log('missing ref');\n", "utf8");

    const runner = createRunner(workspaceRoot) as never as {
      verifyPreviewHealth: (
        plan: {
          workingDirectory: string;
          workspaceKind: "static" | "react" | "generic";
          builderMode: "notes" | "landing" | "dashboard" | "crud" | null;
        },
        scripts: { build?: string; start?: string }
      ) => Promise<{ status: string; details: string }>;
    };

    const result = await runner.verifyPreviewHealth({
      workingDirectory: "generated-apps/agent-smoke",
      workspaceKind: "static",
      builderMode: "notes"
    }, {
      build: "python -c \"print('Static site ready')\"",
      start: "python -m http.server 4173"
    });

    assert.equal(result.status, "failed");
    assert.match(result.details, /does not load generated-apps\/agent-smoke\/app\.js/i);
  });
});

test("AgentTaskRunner normalizes local html scripts to module scripts for vite preview recovery", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      normalizeLocalHtmlScriptsForVite: (content: string, expectedScripts: string[]) => string | null;
    };

    const input = [
      "<!doctype html>",
      "<html>",
      "<body>",
      "<script src=\"app.js\"></script>",
      "</body>",
      "</html>"
    ].join("\n");

    const updated = runner.normalizeLocalHtmlScriptsForVite(input, ["app.js"]);

    assert.match(updated ?? "", /type="module"\s+src="app\.js"/);
  });
});

test("AgentTaskRunner forces static verification scripts for static workspaces", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      resolveVerificationScripts: (
        pkg: { scripts?: { build?: string; start?: string; lint?: string } } | null,
        plan: { workspaceKind: "static" | "react" | "generic" }
      ) => { build?: string; start?: string; lint?: string };
    };

    const scripts = runner.resolveVerificationScripts({
      scripts: {
        build: "tsc -b && vite build",
        start: "vite",
        lint: "eslint ."
      }
    }, { workspaceKind: "static" });

    assert.equal(scripts.build, "python -c \"print('Static site ready')\"");
    assert.equal(scripts.start, "python -m http.server 4173");
    assert.equal(scripts.lint, "eslint .");
  });
});

test("AgentTaskRunner rewrites generated static app package.json away from react build scripts", async () => {
  await withTempDir(async (workspaceRoot) => {
    await mkdir(join(workspaceRoot, "generated-apps/agent-smoke"), { recursive: true });
    await writeFile(join(workspaceRoot, "generated-apps/agent-smoke/package.json"), JSON.stringify({
      name: "agent-smoke",
      private: true,
      version: "0.0.0",
      scripts: {
        dev: "vite",
        build: "tsc -b && vite build",
        lint: "eslint .",
        preview: "vite preview"
      }
    }, null, 2), "utf8");

    const runner = createRunner(workspaceRoot) as never as {
      ensureGeneratedAppPackageJson: (plan: {
        workingDirectory: string;
        workspaceKind: "static" | "react" | "generic";
      }) => Promise<void>;
      tryReadPackageJson: (targetDirectory?: string) => Promise<{
        scripts?: Record<string, string>;
      } | null>;
    };

    await runner.ensureGeneratedAppPackageJson({
      workingDirectory: "generated-apps/agent-smoke",
      workspaceKind: "static"
    });
    const pkg = await runner.tryReadPackageJson("generated-apps/agent-smoke");

    assert.deepEqual(pkg?.scripts, {
      build: "python -c \"print('Static site ready')\"",
      start: "python -m http.server 4173"
    });
  });
});

test("AgentTaskRunner normalizes generated generic package.json files before dependency install", async () => {
  await withTempDir(async (workspaceRoot) => {
    await mkdir(join(workspaceRoot, "generated-apps/api-smoke"), { recursive: true });
    await writeFile(
      join(workspaceRoot, "generated-apps/api-smoke/package.json"),
      `{ "name": "api-smoke", "private": true, "version": "0.1.0", "type": "module", "scripts": { "build": "node -e\\"console.log('Service ready')\\'", "start": "node src/server.js" }, "dependencies": { "express": "4.18.2" } }`,
      "utf8"
    );

    const runner = createRunner(workspaceRoot) as never as {
      ensureGeneratedAppPackageJson: (plan: {
        workingDirectory: string;
        workspaceKind: "static" | "react" | "generic";
      }) => Promise<void>;
      tryReadPackageJson: (targetDirectory?: string) => Promise<{
        type?: string;
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
      } | null>;
    };

    await runner.ensureGeneratedAppPackageJson({
      workingDirectory: "generated-apps/api-smoke",
      workspaceKind: "generic"
    });
    const pkg = await runner.tryReadPackageJson("generated-apps/api-smoke");

    assert.equal(pkg?.type, "module");
    assert.equal(pkg?.scripts?.start, "node src/server.js");
    assert.match(pkg?.scripts?.build ?? "", /Service ready/);
    assert.equal(pkg?.dependencies?.express, "4.18.2");
  });
});

test("AgentTaskRunner restores canonical build scripts for generated generic packages", async () => {
  await withTempDir(async (workspaceRoot) => {
    const appDir = join(workspaceRoot, "generated-apps", "csv-tool");
    await mkdir(join(appDir, "src"), { recursive: true });
    await writeFile(join(appDir, "src", "index.js"), "console.log('ok')\n", "utf8");
    await writeFile(
      join(appDir, "package.json"),
      JSON.stringify({
        name: "csv-tool",
        private: true,
        version: "0.1.0",
        scripts: {
          build: "node -e \"console.log('Tool ready')'\"",
          start: "node src/index.js"
        }
      }, null, 2),
      "utf8"
    );

    const runner = createRunner(workspaceRoot) as never as {
      ensureGeneratedAppPackageJson: (plan: {
        workingDirectory: string;
        workspaceKind: "static" | "react" | "generic";
        candidateFiles: string[];
      }) => Promise<void>;
      tryReadPackageJson: (targetDirectory?: string) => Promise<{ scripts?: Record<string, string> } | null>;
    };

    await runner.ensureGeneratedAppPackageJson({
      workingDirectory: "generated-apps/csv-tool",
      workspaceKind: "generic",
      candidateFiles: [
        "generated-apps/csv-tool/package.json",
        "generated-apps/csv-tool/src/index.js"
      ]
    });

    const packageJson = await runner.tryReadPackageJson("generated-apps/csv-tool");
    assert.equal(packageJson?.scripts?.build, "node -e \"console.log('Tool ready')\"");
    assert.equal(packageJson?.scripts?.start, "node src/index.js");
  });
});

test("AgentTaskRunner rewrites generated desktop React apps with installer-ready Electron scripts", async () => {
  await withTempDir(async (workspaceRoot) => {
    await mkdir(join(workspaceRoot, "generated-apps", "desktop-smoke"), { recursive: true });
    await writeFile(
      join(workspaceRoot, "generated-apps", "desktop-smoke", "package.json"),
      JSON.stringify({
        name: "desktop-smoke",
        private: true,
        version: "0.0.0",
        scripts: {
          dev: "vite"
        }
      }, null, 2),
      "utf8"
    );

    const runner = createRunner(workspaceRoot) as never as {
      ensureGeneratedAppPackageJson: (
        plan: { workingDirectory: string; workspaceKind: "static" | "react" | "generic" },
        artifactType?: "desktop-app"
      ) => Promise<void>;
      tryReadPackageJson: (targetDirectory?: string) => Promise<{
        main?: string;
        scripts?: Record<string, string>;
        devDependencies?: Record<string, string>;
      } | null>;
    };

    await runner.ensureGeneratedAppPackageJson({
      workingDirectory: "generated-apps/desktop-smoke",
      workspaceKind: "react"
    }, "desktop-app");

    const packageJson = await runner.tryReadPackageJson("generated-apps/desktop-smoke");
    assert.equal(packageJson?.main, "electron/main.mjs");
    assert.equal(packageJson?.scripts?.start, "node scripts/desktop-launch.mjs");
    assert.equal(packageJson?.scripts?.["dev:web"], "vite");
    assert.equal(packageJson?.scripts?.["package:win"], "electron-builder --win nsis --publish never");
    assert.equal(packageJson?.devDependencies?.electron, "^35.0.0");
    assert.equal(packageJson?.devDependencies?.["electron-builder"], "^26.8.1");
  });
});

test("AgentTaskRunner writes desktop launcher files for generated desktop React apps", async () => {
  await withTempDir(async (workspaceRoot) => {
    await mkdir(join(workspaceRoot, "generated-apps", "desktop-smoke", "src"), { recursive: true });

    const runner = createRunner(workspaceRoot) as never as {
      ensureGeneratedReactProjectFiles: (
        plan: { workingDirectory: string; workspaceKind: "static" | "react" | "generic" },
        artifactType?: "desktop-app"
      ) => Promise<void>;
      readWorkspaceFile: (path: string) => Promise<{ content: string }>;
    };

    await runner.ensureGeneratedReactProjectFiles({
      workingDirectory: "generated-apps/desktop-smoke",
      workspaceKind: "react"
    }, "desktop-app");

    const desktopLaunch = await runner.readWorkspaceFile("generated-apps/desktop-smoke/scripts/desktop-launch.mjs");
    const electronMain = await runner.readWorkspaceFile("generated-apps/desktop-smoke/electron/main.mjs");

    assert.match(desktopLaunch.content, /findFreePort/);
    assert.match(desktopLaunch.content, /function formatTitle/);
    assert.match(desktopLaunch.content, /packageJsonPath/);
    assert.match(desktopLaunch.content, /node_modules', 'vite', 'bin', 'vite\.js/);
    assert.match(desktopLaunch.content, /generated-desktop-shell\.mjs/);
    assert.match(desktopLaunch.content, /--url/);
    assert.match(electronMain.content, /BrowserWindow/);
    assert.match(electronMain.content, /window\.loadFile\(join\(__dirname, '\.\.', 'dist', 'index\.html'\)\)/);
  });
});

test("AgentTaskRunner uses neutral notes workspace branding for heuristic notes apps", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      buildNotesAppTsx: (
        title: string,
        options: { wantsSearch: boolean; wantsDelete: boolean; wantsAdd: boolean }
      ) => string;
    };

    const content = runner.buildNotesAppTsx("Standalone Windows Desktop", {
      wantsSearch: true,
      wantsDelete: false,
      wantsAdd: true
    });

    assert.match(content, /Notes workspace/);
    assert.doesNotMatch(content, /Cipher Workspace/);
  });
});

test("AgentTaskRunner keeps generated starter app status copy product-neutral", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      buildStaticBootstrapHtml: (projectName: string) => string;
      buildStaticBootstrapJs: (projectName: string) => string;
    };

    const html = runner.buildStaticBootstrapHtml("desktop smoke");
    const js = runner.buildStaticBootstrapJs("desktop smoke");

    assert.match(html, /Starter app/);
    assert.doesNotMatch(html, /Cipher Workspace/);
    assert.match(js, /Continue building in this workspace/);
    assert.doesNotMatch(js, /Cipher Workspace/);
  });
});

test("AgentTaskRunner requires Electron wrapper files for desktop app entry verification", async () => {
  await withTempDir(async (workspaceRoot) => {
    await mkdir(join(workspaceRoot, "generated-apps", "desktop-smoke", "src"), { recursive: true });
    await mkdir(join(workspaceRoot, "generated-apps", "desktop-smoke", "electron"), { recursive: true });
    await writeFile(join(workspaceRoot, "generated-apps", "desktop-smoke", "package.json"), "{}\n", "utf8");
    await writeFile(join(workspaceRoot, "generated-apps", "desktop-smoke", "index.html"), "<!doctype html>\n<div id=\"root\"></div>\n", "utf8");
    await writeFile(join(workspaceRoot, "generated-apps", "desktop-smoke", "src", "main.tsx"), "export {};\n", "utf8");
    await writeFile(join(workspaceRoot, "generated-apps", "desktop-smoke", "src", "App.tsx"), "export default function App() { return null; }\n", "utf8");
    await writeFile(join(workspaceRoot, "generated-apps", "desktop-smoke", "electron", "main.mjs"), "export {};\n", "utf8");

    const runner = createRunner(workspaceRoot) as never as {
      verifyExpectedEntryFiles: (
        plan: {
          workingDirectory: string;
          workspaceKind: "static" | "react" | "generic";
          requestedPaths: string[];
        },
        artifactType: "desktop-app"
      ) => Promise<{ status: string; details: string }>;
    };

    const result = await runner.verifyExpectedEntryFiles({
      workingDirectory: "generated-apps/desktop-smoke",
      workspaceKind: "react",
      requestedPaths: []
    }, "desktop-app");

    assert.equal(result.status, "failed");
    assert.match(result.details, /scripts\/desktop-launch\.mjs/);
  });
});

test("AgentTaskRunner requires packaged Electron entry files for desktop app verification", async () => {
  await withTempDir(async (workspaceRoot) => {
    await mkdir(join(workspaceRoot, "generated-apps", "desktop-smoke", "src"), { recursive: true });
    await mkdir(join(workspaceRoot, "generated-apps", "desktop-smoke", "scripts"), { recursive: true });
    await writeFile(join(workspaceRoot, "generated-apps", "desktop-smoke", "package.json"), "{}\n", "utf8");
    await writeFile(join(workspaceRoot, "generated-apps", "desktop-smoke", "index.html"), "<!doctype html>\n<div id=\"root\"></div>\n", "utf8");
    await writeFile(join(workspaceRoot, "generated-apps", "desktop-smoke", "src", "main.tsx"), "export {};\n", "utf8");
    await writeFile(join(workspaceRoot, "generated-apps", "desktop-smoke", "src", "App.tsx"), "export default function App() { return null; }\n", "utf8");
    await writeFile(join(workspaceRoot, "generated-apps", "desktop-smoke", "scripts", "desktop-launch.mjs"), "export {};\n", "utf8");

    const runner = createRunner(workspaceRoot) as never as {
      verifyExpectedEntryFiles: (
        plan: {
          workingDirectory: string;
          workspaceKind: "static" | "react" | "generic";
          requestedPaths: string[];
        },
        artifactType: "desktop-app"
      ) => Promise<{ status: string; details: string }>;
    };

    const result = await runner.verifyExpectedEntryFiles({
      workingDirectory: "generated-apps/desktop-smoke",
      workspaceKind: "react",
      requestedPaths: []
    }, "desktop-app");

    assert.equal(result.status, "failed");
    assert.match(result.details, /electron\/main\.mjs/);
  });
});

test("AgentTaskRunner requires index.html for generated desktop React app entry verification", async () => {
  await withTempDir(async (workspaceRoot) => {
    await mkdir(join(workspaceRoot, "generated-apps", "desktop-smoke", "src"), { recursive: true });
    await mkdir(join(workspaceRoot, "generated-apps", "desktop-smoke", "electron"), { recursive: true });
    await mkdir(join(workspaceRoot, "generated-apps", "desktop-smoke", "scripts"), { recursive: true });
    await writeFile(join(workspaceRoot, "generated-apps", "desktop-smoke", "package.json"), "{}\n", "utf8");
    await writeFile(join(workspaceRoot, "generated-apps", "desktop-smoke", "src", "main.tsx"), "export {};\n", "utf8");
    await writeFile(join(workspaceRoot, "generated-apps", "desktop-smoke", "src", "App.tsx"), "export default function App() { return null; }\n", "utf8");
    await writeFile(join(workspaceRoot, "generated-apps", "desktop-smoke", "scripts", "desktop-launch.mjs"), "export {};\n", "utf8");
    await writeFile(join(workspaceRoot, "generated-apps", "desktop-smoke", "electron", "main.mjs"), "export {};\n", "utf8");

    const runner = createRunner(workspaceRoot) as never as {
      verifyExpectedEntryFiles: (
        plan: {
          workingDirectory: string;
          workspaceKind: "static" | "react" | "generic";
          requestedPaths: string[];
        },
        artifactType: "desktop-app"
      ) => Promise<{ status: string; details: string }>;
    };

    const result = await runner.verifyExpectedEntryFiles({
      workingDirectory: "generated-apps/desktop-smoke",
      workspaceKind: "react",
      requestedPaths: []
    }, "desktop-app");

    assert.equal(result.status, "failed");
    assert.match(result.details, /index\.html/);
  });
});

test("AgentTaskRunner accepts simple valid stylesheets for preview health", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      isLikelyValidStylesheet: (content: string) => boolean;
    };

    const css = [
      "body {",
      "  margin: 0;",
      "}",
      "",
      "button {",
      "  color: white;",
      "}"
    ].join("\n");

    assert.equal(runner.isLikelyValidStylesheet(css), true);
    assert.equal(runner.isLikelyValidStylesheet("body {"), false);
  });
});

test("AgentTaskRunner accepts built React preview entries with bundled asset scripts", async () => {
  await withTempDir(async (workspaceRoot) => {
    await mkdir(join(workspaceRoot, "generated-apps/react-preview/dist/assets"), { recursive: true });
    await mkdir(join(workspaceRoot, "generated-apps/react-preview/src"), { recursive: true });
    await writeFile(join(workspaceRoot, "generated-apps/react-preview/dist/index.html"), [
      "<!doctype html>",
      "<html lang=\"en\">",
      "  <head>",
      "    <meta charset=\"UTF-8\" />",
      "    <link rel=\"stylesheet\" href=\"/assets/index-123.css\" />",
      "  </head>",
      "  <body>",
      "    <div id=\"root\"></div>",
      "    <script type=\"module\" src=\"/assets/index-123.js\"></script>",
      "  </body>",
      "</html>"
    ].join("\n"), "utf8");
    await writeFile(join(workspaceRoot, "generated-apps/react-preview/dist/assets/index-123.css"), "body { margin: 0; }\n", "utf8");
    await writeFile(join(workspaceRoot, "generated-apps/react-preview/dist/assets/index-123.js"), "console.log('preview');\n", "utf8");
    await writeFile(join(workspaceRoot, "generated-apps/react-preview/src/main.tsx"), [
      "import { createRoot } from 'react-dom/client';",
      "import App from './App';",
      "",
      "createRoot(document.getElementById('root')!).render(<App />);"
    ].join("\n"), "utf8");

    const runner = createRunner(workspaceRoot) as never as {
      verifyPreviewHealth: (
        plan: {
          workingDirectory: string;
          workspaceKind: "static" | "react" | "generic";
          builderMode: "notes" | "landing" | "dashboard" | "crud" | null;
        },
        scripts: { build?: string; start?: string; dev?: string }
      ) => Promise<{ status: "passed" | "failed"; details: string }>;
    };

    const result = await runner.verifyPreviewHealth({
      workingDirectory: "generated-apps/react-preview",
      workspaceKind: "react",
      builderMode: null
    }, {
      build: "vite build",
      dev: "vite"
    });

    assert.equal(result.status, "passed");
  });
});

test("AgentTaskRunner restores a missing React preview entry script with a canonical Vite index file", async () => {
  await withTempDir(async (workspaceRoot) => {
    await mkdir(join(workspaceRoot, "generated-apps/react-preview/src"), { recursive: true });
    await writeFile(join(workspaceRoot, "generated-apps/react-preview/index.html"), [
      "<!doctype html>",
      "<html lang=\"en\">",
      "  <head>",
      "    <meta charset=\"UTF-8\" />",
      "    <title>Broken Preview</title>",
      "  </head>",
      "  <body>",
      "    <div id=\"root\"></div>",
      "  </body>",
      "</html>"
    ].join("\n"), "utf8");

    const runner = createRunner(workspaceRoot) as never as {
      tryHeuristicPreviewHealthFix: (
        plan: {
          workingDirectory: string;
          workspaceKind: "static" | "react" | "generic";
        },
        details: string
      ) => Promise<{ summary: string; edits: Array<{ path: string; content: string }> } | null>;
    };

    const result = await runner.tryHeuristicPreviewHealthFix({
      workingDirectory: "generated-apps/react-preview",
      workspaceKind: "react"
    }, "React preview entry does not load the main application entry.");

    assert.ok(result);
    assert.match(result.summary, /Restored the React preview entry/i);
    assert.equal(result.edits[0]?.path, "generated-apps/react-preview/index.html");
    assert.match(result.edits[0]?.content ?? "", /<script type="module" src="\/src\/main\.tsx"><\/script>/);
  });
});

test("AgentTaskRunner parses loose structured JSON with trailing commas and smart quotes", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      tryParseFixResponse: (
        raw: string,
        responseLabel?: string
      ) => { fix: { edits: Array<{ path: string; content: string }> } } | null;
    };

    const parsed = runner.tryParseFixResponse(
      `{
        “summary”: “fixed”,
        “edits”: [
          { “path”: “src/App.tsx”, “content”: “export default function App() { return null }”, },
        ],
      }`,
      "Implementation"
    );

    assert.equal(parsed?.fix.edits.length, 1);
    assert.equal(parsed?.fix.edits[0]?.path, "src/App.tsx");
  });
});

test("AgentTaskRunner accepts alternative structured edit field names", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      tryParseFixResponse: (
        raw: string,
        responseLabel?: string
      ) => { fix: { edits: Array<{ path: string; content: string }> } } | null;
    };

    const parsed = runner.tryParseFixResponse(
      JSON.stringify({
        summary: "fixed",
        files: [
          {
            file: "styles.css",
            text: "body { margin: 0; }"
          }
        ]
      }),
      "Implementation"
    );

    assert.equal(parsed?.fix.edits.length, 1);
    assert.equal(parsed?.fix.edits[0]?.path, "styles.css");
    assert.equal(parsed?.fix.edits[0]?.content, "body { margin: 0; }");
  });
});

test("AgentTaskRunner accepts object-map edit payloads", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      tryParseFixResponse: (
        raw: string,
        responseLabel?: string
      ) => { fix?: { edits: Array<{ path: string; content: string }> } | undefined } | null;
    };

    const parsed = runner.tryParseFixResponse(
      JSON.stringify({
        summary: "fixed",
        edits: {
          "styles.css": "body { margin: 0; }",
          "app.js": "console.log('ok');"
        }
      }),
      "Implementation"
    );

    assert.equal(parsed?.fix?.edits.length, 2);
    assert.equal(parsed?.fix?.edits[0]?.path, "styles.css");
    assert.equal(parsed?.fix?.edits[1]?.path, "app.js");
  });
});

test("AgentTaskRunner accepts filename and line-array edit payloads", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      tryParseFixResponse: (
        raw: string,
        responseLabel?: string
      ) => { fix?: { edits: Array<{ path: string; content: string }> } | undefined } | null;
    };

    const parsed = runner.tryParseFixResponse(
      JSON.stringify({
        summary: "fixed",
        changes: [
          {
            filename: "src/App.tsx",
            contentLines: [
              "export default function App() {",
              "  return <main>ok</main>;",
              "}"
            ]
          }
        ]
      }),
      "Implementation"
    );

    assert.equal(parsed?.fix?.edits.length, 1);
    assert.equal(parsed?.fix?.edits[0]?.path, "src/App.tsx");
    assert.equal(parsed?.fix?.edits[0]?.content, [
      "export default function App() {",
      "  return <main>ok</main>;",
      "}"
    ].join("\n"));
  });
});

test("AgentTaskRunner distinguishes valid JSON without usable edits from malformed JSON", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      tryParseFixResponse: (
        raw: string,
        responseLabel?: string,
        options?: { strictSchema?: boolean }
      ) => { fix?: { edits: Array<{ path: string; content: string }> }; issue?: string } | null;
    };

    const parsed = runner.tryParseFixResponse(
      JSON.stringify({
        summary: "nothing to change",
        edits: []
      }),
      "Implementation"
    );

    assert.equal(parsed?.issue, "no-usable-edits");
    assert.equal(parsed?.fix, undefined);
  });
});

test("AgentTaskRunner enforces exact JSON shape for strict implementation parsing", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      tryParseFixResponse: (
        raw: string,
        responseLabel?: string,
        options?: { strictSchema?: boolean }
      ) => { fix?: { edits: Array<{ path: string; content: string }> }; issue?: string } | null;
    };

    const wrapped = runner.tryParseFixResponse(
      `Here is the update:
      {"summary":"done","edits":[{"path":"src/App.tsx","content":"export default function App() { return null; }"}]}`,
      "Implementation",
      { strictSchema: true }
    );
    assert.equal(wrapped?.issue, "schema-mismatch");

    const aliased = runner.tryParseFixResponse(
      JSON.stringify({
        summary: "done",
        files: [{ file: "src/App.tsx", text: "export default function App() { return null; }" }]
      }),
      "Implementation",
      { strictSchema: true }
    );
    assert.equal(aliased?.issue, "schema-mismatch");

    const exact = runner.tryParseFixResponse(
      JSON.stringify({
        summary: "done",
        edits: [{ path: "src/App.tsx", content: "export default function App() { return null; }" }]
      }),
      "Implementation",
      { strictSchema: true }
    );
    assert.equal(exact?.fix?.edits.length, 1);
    assert.equal(exact?.fix?.edits[0]?.path, "src/App.tsx");

    const fenced = runner.tryParseFixResponse(
      "```json\n" + JSON.stringify({
        summary: "done",
        edits: [{ path: "src/App.tsx", content: "export default function App() { return null; }" }]
      }) + "\n```",
      "Implementation",
      { strictSchema: true }
    );
    assert.equal(fenced?.fix?.edits.length, 1);
  });
});

test("AgentTaskRunner accepts JSON-object file content for strict package manifest edits", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      tryParseFixResponse: (
        raw: string,
        responseLabel?: string,
        options?: { strictSchema?: boolean }
      ) => { fix?: { edits: Array<{ path: string; content: string }> }; issue?: string } | null;
    };

    const parsed = runner.tryParseFixResponse(
      JSON.stringify({
        summary: "update package manifest",
        edits: [{
          path: "generated-apps/tool/package.json",
          content: {
            name: "tool",
            private: true,
            version: "0.1.0"
          }
        }]
      }),
      "Implementation",
      { strictSchema: true }
    );

    assert.equal(parsed?.fix?.edits.length, 1);
    assert.match(parsed?.fix?.edits[0]?.content ?? "", /"name": "tool"/);

    const rejected = runner.tryParseFixResponse(
      JSON.stringify({
        summary: "bad js edit",
        edits: [{
          path: "generated-apps/tool/src/index.js",
          content: {
            name: "tool"
          }
        }]
      }),
      "Implementation",
      { strictSchema: true }
    );

    assert.equal(rejected?.issue, "schema-mismatch");
  });
});

test("AgentTaskRunner accepts nested strict implementation payloads under summary", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      tryParseFixResponse: (
        raw: string,
        responseLabel?: string,
        options?: { strictSchema?: boolean }
      ) => { fix?: { summary: string; edits: Array<{ path: string; content: string }> }; issue?: string } | null;
    };

    const parsed = runner.tryParseFixResponse(
      JSON.stringify({
        summary: {
          edits: [{
            path: "generated-apps/tool/package.json",
            content: {
              name: "tool",
              private: true
            }
          }]
        }
      }),
      "Implementation",
      { strictSchema: true }
    );

    assert.equal(parsed?.issue, undefined);
    assert.equal(parsed?.fix?.edits.length, 1);
    assert.equal(parsed?.fix?.edits[0]?.path, "generated-apps/tool/package.json");
    assert.match(parsed?.fix?.edits[0]?.content ?? "", /"name": "tool"/);
    assert.match(parsed?.fix?.summary ?? "", /Recovered strict structured edits/i);
  });
});

test("AgentTaskRunner rejects nested strict payloads with extra fields", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      tryParseFixResponse: (
        raw: string,
        responseLabel?: string,
        options?: { strictSchema?: boolean }
      ) => { fix?: { summary: string; edits: Array<{ path: string; content: string }> }; issue?: string } | null;
    };

    const parsed = runner.tryParseFixResponse(
      JSON.stringify({
        summary: {
          edits: [{
            path: "generated-apps/tool/package.json",
            content: {
              name: "tool"
            }
          }],
          note: "extra wrapper text"
        }
      }),
      "Implementation",
      { strictSchema: true }
    );

    assert.equal(parsed?.issue, "schema-mismatch");
  });
});

test("AgentTaskRunner retries implementation when the first reply violates the strict schema contract", async () => {
  await withTempDir(async (workspaceRoot) => {
    const appDir = join(workspaceRoot, "generated-apps", "site");
    await mkdir(appDir, { recursive: true });
    await writeFile(join(appDir, "index.html"), "<h1>Old</h1>", "utf8");

    const responses = [
      `Here is the update:
      {"summary":"wrapped","edits":[{"path":"generated-apps/site/index.html","content":"<h1>Wrapped</h1>"}]}`,
      JSON.stringify({
        summary: "updated page",
        edits: [{ path: "generated-apps/site/index.html", content: "<h1>New</h1>" }]
      })
    ];

    const runner = createRunnerWithServices(
      workspaceRoot,
      {
        apiKey: "test-key",
        defaultModel: "first-model",
        models: ["first-model"],
        routing: {
          default: "first-model",
          think: "first-model",
          longContext: "first-model"
        }
      },
      {
        sendMessageAdvanced: async (
          _messages: unknown,
          _model: string,
          onChunk: (chunk: string) => void
        ) => {
          const next = responses.shift() ?? "";
          onChunk(next);
          return next;
        }
      }
    ) as never as {
      requestTaskImplementation: (
        taskId: string,
        userPrompt: string,
        plan: {
          summary: string;
          candidateFiles: string[];
          requestedPaths: string[];
          promptTerms: string[];
          workingDirectory: string;
          workspaceManifest: string[];
          workItems: Array<{ title: string; instruction: string; allowedPaths?: string[] }>;
          promptRequirements: unknown[];
          workspaceKind: "static" | "react" | "generic";
          builderMode: "notes" | "landing" | "dashboard" | "crud" | "kanban" | null;
        },
        workItem?: { title: string; instruction: string; allowedPaths?: string[] }
      ) => Promise<{ summary: string; edits: Array<{ path: string; content: string }> }>;
      modelRouteStats: Map<string, { successes: number; failures: number; transientFailures: number; semanticFailures: number }>;
      buildModelRouteKey: (route: { model: string; baseUrl: string; skipAuth: boolean }) => string;
    };

    const plan = {
      summary: "",
      candidateFiles: ["generated-apps/site/index.html"],
      requestedPaths: [],
      promptTerms: [],
      workingDirectory: "generated-apps/site",
      workspaceManifest: ["file: generated-apps/site/index.html"],
      workItems: [{
        title: "Implement requested changes",
        instruction: "Update the page",
        allowedPaths: ["generated-apps/site/index.html"]
      }],
      promptRequirements: [],
      workspaceKind: "static" as const,
      builderMode: null
    };

    const result = await runner.requestTaskImplementation(
      "task-1",
      "Update the page",
      plan,
      plan.workItems[0]
    );

    assert.equal(result.edits.length, 1);
    assert.equal(result.edits[0]?.content, "<h1>New</h1>");
    const stats = runner.modelRouteStats.get(runner.buildModelRouteKey({
      model: "first-model",
      baseUrl: "https://openrouter.ai/api/v1",
      skipAuth: false
    }));
    assert.equal(stats?.semanticFailures, 1);
  });
});

test("AgentTaskRunner advances to the next implementation model route after strict contract failures", async () => {
  await withTempDir(async (workspaceRoot) => {
    const appDir = join(workspaceRoot, "generated-apps", "site");
    await mkdir(appDir, { recursive: true });
    await writeFile(join(appDir, "index.html"), "<h1>Old</h1>", "utf8");

    const responsesByModel = new Map<string, string[]>([
      ["first-model", [
        `Here is the update:
        {"summary":"wrapped","edits":[{"path":"generated-apps/site/index.html","content":"<h1>Wrapped</h1>"}]}`,
        `Here is the retry:
        {"summary":"wrapped again","edits":[{"path":"generated-apps/site/index.html","content":"<h1>Still wrapped</h1>"}]}`
      ]],
      ["second-model", [
        JSON.stringify({
          summary: "updated page",
          edits: [{ path: "generated-apps/site/index.html", content: "<h1>New</h1>" }]
        })
      ]]
    ]);

    const runner = createRunnerWithServices(
      workspaceRoot,
      {
        apiKey: "test-key",
        defaultModel: "first-model",
        models: ["first-model", "second-model"],
        routing: {
          default: "first-model",
          think: "first-model",
          longContext: "first-model"
        }
      },
      {
        sendMessageAdvanced: async (
          _messages: unknown,
          model: string,
          onChunk: (chunk: string) => void
        ) => {
          const queue = responsesByModel.get(model) ?? [];
          const next = queue.shift() ?? "";
          onChunk(next);
          return next;
        }
      }
    ) as never as {
      requestTaskImplementation: (
        taskId: string,
        userPrompt: string,
        plan: {
          summary: string;
          candidateFiles: string[];
          requestedPaths: string[];
          promptTerms: string[];
          workingDirectory: string;
          workspaceManifest: string[];
          workItems: Array<{ title: string; instruction: string; allowedPaths?: string[] }>;
          promptRequirements: unknown[];
          workspaceKind: "static" | "react" | "generic";
          builderMode: "notes" | "landing" | "dashboard" | "crud" | "kanban" | null;
        },
        workItem?: { title: string; instruction: string; allowedPaths?: string[] }
      ) => Promise<{ summary: string; edits: Array<{ path: string; content: string }> }>;
    };

    const plan = {
      summary: "",
      candidateFiles: ["generated-apps/site/index.html"],
      requestedPaths: [],
      promptTerms: [],
      workingDirectory: "generated-apps/site",
      workspaceManifest: ["file: generated-apps/site/index.html"],
      workItems: [{
        title: "Implement requested changes",
        instruction: "Update the page",
        allowedPaths: ["generated-apps/site/index.html"]
      }],
      promptRequirements: [],
      workspaceKind: "static" as const,
      builderMode: null
    };

    const result = await runner.requestTaskImplementation(
      "task-1",
      "Update the page",
      plan,
      plan.workItems[0]
    );

    assert.equal(result.edits[0]?.content, "<h1>New</h1>");
  });
});

test("AgentTaskRunner advances to the next implementation model route after empty responses", async () => {
  await withTempDir(async (workspaceRoot) => {
    const appDir = join(workspaceRoot, "generated-apps", "site");
    await mkdir(appDir, { recursive: true });
    await writeFile(join(appDir, "index.html"), "<h1>Old</h1>", "utf8");

    const responsesByModel = new Map<string, string[]>([
      ["first-model", [""]],
      ["second-model", [
        JSON.stringify({
          summary: "updated page",
          edits: [{ path: "generated-apps/site/index.html", content: "<h1>Recovered</h1>" }]
        })
      ]]
    ]);

    const runner = createRunnerWithServices(
      workspaceRoot,
      {
        apiKey: "test-key",
        defaultModel: "first-model",
        models: ["first-model", "second-model"],
        routing: {
          default: "first-model",
          think: "first-model",
          longContext: "first-model"
        }
      },
      {
        sendMessageAdvanced: async (
          _messages: unknown,
          model: string,
          onChunk: (chunk: string) => void
        ) => {
          const queue = responsesByModel.get(model) ?? [];
          const next = queue.shift() ?? "";
          onChunk(next);
          return next;
        }
      }
    ) as never as {
      requestTaskImplementation: (
        taskId: string,
        userPrompt: string,
        plan: {
          summary: string;
          candidateFiles: string[];
          requestedPaths: string[];
          promptTerms: string[];
          workingDirectory: string;
          workspaceManifest: string[];
          workItems: Array<{ title: string; instruction: string; allowedPaths?: string[] }>;
          promptRequirements: unknown[];
          workspaceKind: "static" | "react" | "generic";
          builderMode: "notes" | "landing" | "dashboard" | "crud" | "kanban" | null;
        },
        workItem?: { title: string; instruction: string; allowedPaths?: string[] }
      ) => Promise<{ summary: string; edits: Array<{ path: string; content: string }> }>;
    };

    const plan = {
      summary: "",
      candidateFiles: ["generated-apps/site/index.html"],
      requestedPaths: [],
      promptTerms: [],
      workingDirectory: "generated-apps/site",
      workspaceManifest: ["file: generated-apps/site/index.html"],
      workItems: [{
        title: "Implement requested changes",
        instruction: "Update the page",
        allowedPaths: ["generated-apps/site/index.html"]
      }],
      promptRequirements: [],
      workspaceKind: "static" as const,
      builderMode: null
    };

    const result = await runner.requestTaskImplementation(
      "task-1",
      "Update the page",
      plan,
      plan.workItems[0]
    );

    assert.equal(result.edits[0]?.content, "<h1>Recovered</h1>");
  });
});

test("AgentTaskRunner retries script-tool runtime verification with a fixture input when usage output is returned", async () => {
  await withTempDir(async (workspaceRoot) => {
    const appDir = join(workspaceRoot, "generated-apps", "tool-smoke");
    await mkdir(join(appDir, "src"), { recursive: true });
    await writeFile(join(appDir, "package.json"), JSON.stringify({
      name: "tool-smoke",
      private: true,
      version: "0.1.0",
      type: "module",
      scripts: {
        start: "node src/index.js"
      }
    }, null, 2), "utf8");
    await writeFile(join(appDir, "src", "index.js"), [
      "import { readFileSync } from 'node:fs';",
      "",
      "const target = process.argv[2];",
      "if (!target) {",
      "  console.error('Usage: tool-smoke <markdown-file>');",
      "  process.exit(1);",
      "}",
      "",
      "const content = readFileSync(target, 'utf8');",
      "console.log(content.includes('#') ? 'ok' : 'missing heading');"
    ].join("\n") + "\n", "utf8");

    const runner = createRunner(workspaceRoot) as never as {
      executeArtifactRuntimeVerification: (
        taskId: string,
        scriptName: "start" | "dev",
        artifactType: "script-tool" | "web-app" | "api-service" | "library" | "desktop-app" | "workspace-change" | "unknown",
        plan: {
          workingDirectory: string;
          workspaceKind: "static" | "react" | "generic";
          builderMode: "notes" | "landing" | "dashboard" | "crud" | "kanban" | null;
        },
        scripts: { start?: string; dev?: string }
      ) => Promise<{ ok: boolean; combinedOutput: string }>;
    };

    const result = await runner.executeArtifactRuntimeVerification(
      "manual",
      "start",
      "script-tool",
      {
        workingDirectory: "generated-apps/tool-smoke",
        workspaceKind: "generic",
        builderMode: null
      },
      { start: "node src/index.js" }
    );

    assert.equal(result.ok, true);
    assert.match(result.combinedOutput, /ok/i);
  });
});

test("AgentTaskRunner retries script-tool runtime verification with a JSON fixture when the prompt expects JSON input", async () => {
  await withTempDir(async (workspaceRoot) => {
    const appDir = join(workspaceRoot, "generated-apps", "tool-json-smoke");
    await mkdir(join(appDir, "src"), { recursive: true });
    await writeFile(join(appDir, "package.json"), JSON.stringify({
      name: "tool-json-smoke",
      private: true,
      version: "0.1.0",
      type: "module",
      scripts: {
        start: "node src/index.js"
      }
    }, null, 2), "utf8");
    await writeFile(join(appDir, "src", "index.js"), [
      "import { readFileSync } from 'node:fs';",
      "",
      "const target = process.argv[2];",
      "if (!target) {",
      "  console.error('Usage: tool-json-smoke <json-file>');",
      "  process.exit(1);",
      "}",
      "",
      "const content = readFileSync(target, 'utf8');",
      "const parsed = JSON.parse(content);",
      "console.log(parsed.status === 'ok' ? 'json-ok' : 'json-bad');"
    ].join("\n") + "\n", "utf8");

    const runner = createRunner(workspaceRoot) as never as {
      executeArtifactRuntimeVerification: (
        taskId: string,
        scriptName: "start" | "dev",
        artifactType: "script-tool" | "web-app" | "api-service" | "library" | "desktop-app" | "workspace-change" | "unknown",
        plan: {
          workingDirectory: string;
          workspaceKind: "static" | "react" | "generic";
          builderMode: "notes" | "landing" | "dashboard" | "crud" | "kanban" | null;
        },
        scripts: { start?: string; dev?: string }
      ) => Promise<{ ok: boolean; combinedOutput: string }>;
      tasks: Map<string, {
        id: string;
        prompt: string;
        status: string;
        createdAt: string;
        updatedAt: string;
        summary: string;
        steps: unknown[];
        telemetry: { fallbackUsed: boolean; modelAttempts: unknown[] };
      }>;
    };

    const now = new Date().toISOString();
    runner.tasks = new Map([["manual", {
      id: "manual",
      prompt: "[SOAK:realworld.json-audit-cli] Create a command-line tool that reads a JSON file and prints a compact audit summary.",
      status: "running",
      createdAt: now,
      updatedAt: now,
      summary: "",
      steps: [],
      telemetry: {
        fallbackUsed: false,
        modelAttempts: []
      }
    }]]);

    const result = await runner.executeArtifactRuntimeVerification(
      "manual",
      "start",
      "script-tool",
      {
        workingDirectory: "generated-apps/tool-json-smoke",
        workspaceKind: "generic",
        builderMode: null
      },
      { start: "node src/index.js" }
    );

    assert.equal(result.ok, true);
    assert.match(result.combinedOutput, /json-ok/i);
  });
});

test("AgentTaskRunner restores a missing start script after launch repair edits", async () => {
  await withTempDir(async (workspaceRoot) => {
    await mkdir(join(workspaceRoot, "generated-apps", "api-smoke"), { recursive: true });
    await writeFile(join(workspaceRoot, "generated-apps", "api-smoke", "package.json"), JSON.stringify({
      name: "api-smoke",
      private: true,
      version: "0.1.0",
      scripts: {
        build: "node -e \"console.log('build ok')\""
      }
    }, null, 2), "utf8");

    const runner = createRunner(workspaceRoot) as never as {
      restoreMissingRuntimeScript: (
        workingDirectory: string,
        scriptName: "start" | "dev",
        command: string
      ) => Promise<boolean>;
      tryReadPackageJson: (targetDirectory?: string) => Promise<{ scripts?: { start?: string; build?: string } } | null>;
    };

    const restored = await runner.restoreMissingRuntimeScript(
      "generated-apps/api-smoke",
      "start",
      "node src/server.js"
    );

    assert.equal(restored, true);
    const packageJson = await runner.tryReadPackageJson("generated-apps/api-smoke");
    assert.equal(packageJson?.scripts?.start, "node src/server.js");
    assert.equal(packageJson?.scripts?.build, "node -e \"console.log('build ok')\"");
  });
});

test("AgentTaskRunner resolves served web page URLs from runtime output and script fallbacks", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      resolveServedWebPageUrl: (
        plan: {
          workspaceKind: "static" | "react" | "generic";
          builderMode: "notes" | "landing" | "dashboard" | "crud" | "kanban" | null;
        },
        scripts: { start?: string; dev?: string },
        runtimeScript: "start" | "dev",
        launch: { combinedOutput: string }
      ) => string | null;
    };

    const fromOutput = runner.resolveServedWebPageUrl(
      { workspaceKind: "react", builderMode: "dashboard" },
      { dev: "vite" },
      "dev",
      { combinedOutput: "\u001b[32mLocal\u001b[39m:   \u001b[36mhttp://localhost:\u001b[1m4321\u001b[22m/\u001b[39m\n" }
    );
    assert.equal(fromOutput, "http://localhost:4321/");

    const staticFallback = runner.resolveServedWebPageUrl(
      { workspaceKind: "static", builderMode: "landing" },
      { start: "python -m http.server 4173" },
      "start",
      { combinedOutput: "" }
    );
    assert.equal(staticFallback, "http://127.0.0.1:4173/");

    const reactFallback = runner.resolveServedWebPageUrl(
      { workspaceKind: "react", builderMode: null },
      { dev: "vite" },
      "dev",
      { combinedOutput: "" }
    );
    assert.equal(reactFallback, "http://127.0.0.1:5173/");
  });
});

test("AgentTaskRunner verifies the live served web page for web apps", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      verifyServedWebPage: (
        plan: {
          workingDirectory: string;
          workspaceKind: "static" | "react" | "generic";
          builderMode: "notes" | "landing" | "dashboard" | "crud" | "kanban" | null;
        },
        scripts: { start?: string; dev?: string },
        runtimeScript: "start" | "dev",
        launch: { combinedOutput: string }
      ) => Promise<{ status: string; details: string }>;
      runServedPageBrowserSmoke: () => Promise<{ status: string; details: string }>;
    };

    runner.runServedPageBrowserSmoke = async () => ({
      status: "passed",
      details: "Rendered page smoke passed."
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(
      "<!doctype html><html><body><main><h1>Launch page</h1><a href=\"#signup\">Join</a></main></body></html>",
      {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" }
      }
    );

    try {
      const result = await runner.verifyServedWebPage(
        {
          workingDirectory: "generated-apps/site",
          workspaceKind: "static",
          builderMode: "landing"
        },
        { start: "python -m http.server 4173" },
        "start",
        { combinedOutput: "" }
      );

      assert.equal(result.status, "passed");
      assert.match(result.details, /browser smoke successfully/i);
      assert.match(result.details, /http:\/\/127\.0\.0\.1:4173\//i);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("AgentTaskRunner probes API services through health and collection endpoints", async () => {
  await withTempDir(async (workspaceRoot) => {
    await mkdir(join(workspaceRoot, "generated-apps", "api-probe", "src"), { recursive: true });
    await writeFile(join(workspaceRoot, "generated-apps", "api-probe", "src", "server.js"), [
      "if (req.method === 'GET' && pathname === '/health') return sendJson(res, 200, { status: 'ok' });",
      "if (req.method === 'GET' && pathname === '/records') return sendJson(res, 200, { records: [] });",
      "const port = Number(process.env.PORT || 3100);"
    ].join("\n"), "utf8");

    const runner = createRunner(workspaceRoot) as never as {
      probeApiService: (
        plan: { workingDirectory: string },
        scripts: { start?: string; dev?: string },
        runtimeScript: "start" | "dev",
        launch: { combinedOutput: string }
      ) => Promise<{ status: string; details: string }>;
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/health")) {
        return new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      if (url.endsWith("/records")) {
        return new Response(JSON.stringify({ records: [{ id: "1" }] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      return new Response("missing", { status: 404 });
    };

    try {
      const result = await runner.probeApiService(
        {
          workingDirectory: "generated-apps/api-probe"
        },
        { start: "node src/server.js" },
        "start",
        { combinedOutput: "" }
      );

      assert.equal(result.status, "passed");
      assert.match(result.details, /\/health/);
      assert.match(result.details, /\/records/);
      assert.match(result.details, /3100/);
      assert.doesNotMatch(result.details, /create probes/i);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("AgentTaskRunner probes API create routes when the service exposes a POST collection endpoint", async () => {
  await withTempDir(async (workspaceRoot) => {
    await mkdir(join(workspaceRoot, "generated-apps", "api-create-probe", "src"), { recursive: true });
    await writeFile(join(workspaceRoot, "generated-apps", "api-create-probe", "src", "server.js"), [
      "if (req.method === 'GET' && pathname === '/health') return sendJson(res, 200, { status: 'ok' });",
      "if (req.method === 'GET' && pathname === '/invoices') return sendJson(res, 200, { invoices: [] });",
      "if (req.method === 'POST' && pathname === '/invoices') {",
      "  const body = await readJsonBody(req);",
      "  return sendJson(res, 201, { id: '2', customer: String(body.customer ?? 'Acme Corp'), status: 'active' });",
      "}",
      "const port = Number(process.env.PORT || 3200);"
    ].join("\n"), "utf8");

    const runner = createRunner(workspaceRoot) as never as {
      probeApiService: (
        plan: {
          workingDirectory: string;
          spec: { domainFocus: string };
        },
        scripts: { start?: string; dev?: string },
        runtimeScript: "start" | "dev",
        launch: { combinedOutput: string }
      ) => Promise<{ status: string; details: string }>;
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/health")) {
        return new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      if (url.endsWith("/invoices") && (!init?.method || init.method === "GET")) {
        return new Response(JSON.stringify({ invoices: [{ id: "1", customer: "Existing Co" }] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      if (url.endsWith("/invoices") && init?.method === "POST") {
        const body = JSON.parse(String(init.body ?? "{}"));
        return new Response(JSON.stringify({ id: "2", customer: body.customer, status: "active" }), {
          status: 201,
          headers: { "content-type": "application/json" }
        });
      }
      return new Response("missing", { status: 404 });
    };

    try {
      const result = await runner.probeApiService(
        {
          workingDirectory: "generated-apps/api-create-probe",
          spec: { domainFocus: "finance" }
        },
        { start: "node src/server.js" },
        "start",
        { combinedOutput: "" }
      );

      assert.equal(result.status, "passed");
      assert.match(result.details, /create probes/i);
      assert.match(result.details, /\/invoices/);
      assert.match(result.details, /3200/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("AgentTaskRunner validates JSON output for CLI runtime probes", async () => {
  await withTempDir(async (workspaceRoot) => {
    await mkdir(join(workspaceRoot, "generated-apps", "cli-probe", "src"), { recursive: true });
    await writeFile(join(workspaceRoot, "generated-apps", "cli-probe", "src", "index.js"), "console.log(JSON.stringify({ ok: true }));\n", "utf8");

    const runner = createRunner(workspaceRoot) as never as {
      verifyCliRuntimeDepth: (
        plan: { workingDirectory: string; promptTerms: string[] },
        launch: { combinedOutput: string }
      ) => Promise<{ status: string; details: string }>;
    };

    const passed = await runner.verifyCliRuntimeDepth(
      {
        workingDirectory: "generated-apps/cli-probe",
        promptTerms: ["emit", "json", "output", "audit"]
      },
      {
        combinedOutput: "{\n  \"ok\": true,\n  \"count\": 2\n}"
      }
    );

    const failed = await runner.verifyCliRuntimeDepth(
      {
        workingDirectory: "generated-apps/cli-probe",
        promptTerms: ["emit", "json", "output", "audit"]
      },
      {
        combinedOutput: "Usage: cli-probe <file>"
      }
    );

    assert.equal(passed.status, "passed");
    assert.match(passed.details, /parseable json/i);
    assert.equal(failed.status, "failed");
    assert.match(failed.details, /usage guidance/i);
  });
});

test("AgentTaskRunner accepts plain text summaries for CLI probes that only read JSON input", async () => {
  await withTempDir(async (workspaceRoot) => {
    await mkdir(join(workspaceRoot, "generated-apps", "cli-text-probe", "src"), { recursive: true });
    await writeFile(join(workspaceRoot, "generated-apps", "cli-text-probe", "src", "index.js"), "console.log('keys: 4\\nmissing: 1');\n", "utf8");

    const runner = createRunner(workspaceRoot) as never as {
      verifyCliRuntimeDepth: (
        plan: { workingDirectory: string; promptTerms: string[] },
        launch: { combinedOutput: string }
      ) => Promise<{ status: string; details: string }>;
    };

    const result = await runner.verifyCliRuntimeDepth(
      {
        workingDirectory: "generated-apps/cli-text-probe",
        promptTerms: ["reads", "json", "file", "prints", "compact", "audit", "summary"]
      },
      {
        combinedOutput: "keys: 4\nmissing: 1"
      }
    );

    assert.equal(result.status, "passed");
    assert.match(result.details, /produced \d+ characters of output/i);
  });
});

test("AgentTaskRunner passes prompt requirement IDs into browser smoke helper invocations", async () => {
  await withTempDir(async (workspaceRoot) => {
    await mkdir(join(workspaceRoot, "scripts"), { recursive: true });
    await writeFile(join(workspaceRoot, "scripts", "browser-smoke.cjs"), "module.exports = {};\n", "utf8");

    const runner = createRunner(workspaceRoot) as never as {
      runServedPageBrowserSmoke: (
        url: string,
        plan: {
          workspaceKind: "static" | "react" | "generic";
          builderMode: "notes" | "landing" | "dashboard" | "crud" | "kanban" | null;
          promptRequirements: Array<{ id: string }>;
        }
      ) => Promise<{ status: string; details: string }>;
      resolveElectronBinary: () => string | null;
      executeDetachedCommand: (
        taskId: string,
        request: { command: string; args?: string[]; cwd?: string; timeoutMs?: number }
      ) => Promise<{ ok: boolean; combinedOutput: string; stdout: string; stderr: string }>;
    };

    let capturedArgs: string[] = [];
    runner.resolveElectronBinary = () => "electron";
    runner.executeDetachedCommand = async (_taskId, request) => {
      capturedArgs = request.args ?? [];
      return {
        ok: true,
        combinedOutput: "{\"status\":\"passed\",\"details\":\"ok\"}\n",
        stdout: "",
        stderr: ""
      };
    };

    const result = await runner.runServedPageBrowserSmoke("file:///tmp/desktop-preview/index.html", {
      workspaceKind: "react",
      builderMode: "dashboard",
      promptRequirements: [
        { id: "req-summary" },
        { id: "req-persistence" },
        { id: "req-summary" }
      ]
    });

    assert.equal(result.status, "passed");
    assert.equal(capturedArgs.includes("--prompt-requirement"), true);
    assert.equal(capturedArgs.filter((value) => value === "--prompt-requirement").length, 2);
    assert.equal(capturedArgs.includes("req-summary"), true);
    assert.equal(capturedArgs.includes("req-persistence"), true);
  });
});

test("AgentTaskRunner runs desktop interaction smoke against the built preview", async () => {
  await withTempDir(async (workspaceRoot) => {
    await mkdir(join(workspaceRoot, "generated-apps", "desktop-probe", "dist"), { recursive: true });
    await writeFile(join(workspaceRoot, "generated-apps", "desktop-probe", "dist", "index.html"), "<!doctype html><html><body><div id=\"root\"></div></body></html>\n", "utf8");

    const runner = createRunner(workspaceRoot) as never as {
      verifyDesktopInteractionProbe: (
        plan: {
          workingDirectory: string;
          workspaceKind: "react" | "static" | "generic";
          builderMode: "notes" | "landing" | "dashboard" | "crud" | "kanban" | null;
        },
        scripts: { start?: string; dev?: string }
      ) => Promise<{ status: string; details: string }>;
      runServedPageBrowserSmoke: (url: string) => Promise<{ status: string; details: string }>;
    };

    let capturedUrl = "";
    runner.runServedPageBrowserSmoke = async (url) => {
      capturedUrl = url;
      return {
        status: "passed",
        details: "Browser smoke interaction passed."
      };
    };

    const result = await runner.verifyDesktopInteractionProbe(
      {
        workingDirectory: "generated-apps/desktop-probe",
        workspaceKind: "react",
        builderMode: "dashboard"
      },
      { start: "node scripts/desktop-launch.mjs" }
    );

    assert.equal(result.status, "passed");
    assert.match(result.details, /desktop preview interaction passed/i);
    assert.match(capturedUrl, /^file:/i);
  });
});

test("AgentTaskRunner fails served web verification when live HTML is not valid for the app type", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      verifyServedWebPage: (
        plan: {
          workingDirectory: string;
          workspaceKind: "static" | "react" | "generic";
          builderMode: "notes" | "landing" | "dashboard" | "crud" | "kanban" | null;
        },
        scripts: { start?: string; dev?: string },
        runtimeScript: "start" | "dev",
        launch: { combinedOutput: string }
      ) => Promise<{ status: string; details: string }>;
      runServedPageBrowserSmoke: () => Promise<{ status: string; details: string }>;
    };

    runner.runServedPageBrowserSmoke = async () => ({
      status: "passed",
      details: "Rendered page smoke passed."
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(
      "{\"ok\":true}",
      {
        status: 200,
        headers: { "content-type": "application/json" }
      }
    );

    try {
      const result = await runner.verifyServedWebPage(
        {
          workingDirectory: "generated-apps/site",
          workspaceKind: "static",
          builderMode: "landing"
        },
        { start: "python -m http.server 4173" },
        "start",
        { combinedOutput: "" }
      );

      assert.equal(result.status, "failed");
      assert.match(result.details, /did not return html content-type/i);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("AgentTaskRunner fails served web verification when browser smoke fails after HTML fetch succeeds", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      verifyServedWebPage: (
        plan: {
          workingDirectory: string;
          workspaceKind: "static" | "react" | "generic";
          builderMode: "notes" | "landing" | "dashboard" | "crud" | "kanban" | null;
        },
        scripts: { start?: string; dev?: string },
        runtimeScript: "start" | "dev",
        launch: { combinedOutput: string }
      ) => Promise<{ status: string; details: string }>;
      runServedPageBrowserSmoke: () => Promise<{ status: string; details: string }>;
    };

    runner.runServedPageBrowserSmoke = async () => ({
      status: "failed",
      details: "Rendered page did not include a visible heading."
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(
      "<!doctype html><html><body><main><div>Loaded</div></main></body></html>",
      {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" }
      }
    );

    try {
      const result = await runner.verifyServedWebPage(
        {
          workingDirectory: "generated-apps/site",
          workspaceKind: "static",
          builderMode: "landing"
        },
        { start: "python -m http.server 4173" },
        "start",
        { combinedOutput: "" }
      );

      assert.equal(result.status, "failed");
      assert.match(result.details, /did not include a visible heading/i);
      assert.match(result.details, /http:\/\/127\.0\.0\.1:4173\//i);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("AgentTaskRunner skips browser smoke infrastructure failures after HTML fetch succeeds", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunner(workspaceRoot) as never as {
      verifyServedWebPage: (
        plan: {
          workingDirectory: string;
          workspaceKind: "static" | "react" | "generic";
          builderMode: "notes" | "landing" | "dashboard" | "crud" | "kanban" | null;
        },
        scripts: { start?: string; dev?: string },
        runtimeScript: "start" | "dev",
        launch: { combinedOutput: string }
      ) => Promise<{ status: string; details: string }>;
      runServedPageBrowserSmoke: () => Promise<{ status: string; details: string }>;
    };

    runner.runServedPageBrowserSmoke = async () => ({
      status: "skipped",
      details: "Browser smoke helper was unavailable: Cannot read properties of undefined (reading 'whenReady')"
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(
      "<!doctype html><html><body><main><h1>Launch page</h1><a href=\"#signup\">Join</a></main></body></html>",
      {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" }
      }
    );

    try {
      const result = await runner.verifyServedWebPage(
        {
          workingDirectory: "generated-apps/site",
          workspaceKind: "static",
          builderMode: "landing"
        },
        { start: "python -m http.server 4173" },
        "start",
        { combinedOutput: "" }
      );

      assert.equal(result.status, "passed");
      assert.match(result.details, /browser smoke skipped/i);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("AgentTaskRunner retries implementation responses that target files outside the allowed scope", async () => {
  await withTempDir(async (workspaceRoot) => {
    const appDir = join(workspaceRoot, "generated-apps", "site");
    await mkdir(appDir, { recursive: true });
    await writeFile(join(appDir, "index.html"), "<h1>Old</h1>", "utf8");

    const responses = [
      JSON.stringify({
        summary: "wrong target",
        edits: [{ path: "README.md", content: "# Wrong file" }]
      }),
      JSON.stringify({
        summary: "updated page",
        edits: [{ path: "generated-apps/site/index.html", content: "<h1>New</h1>" }]
      })
    ];

    const runner = createRunnerWithServices(
      workspaceRoot,
      {
        apiKey: "test-key",
        defaultModel: "first-model",
        models: ["first-model"],
        routing: {
          default: "first-model",
          think: "first-model",
          longContext: "first-model"
        }
      },
      {
        sendMessageAdvanced: async (
          _messages: unknown,
          _model: string,
          onChunk: (chunk: string) => void
        ) => {
          const next = responses.shift() ?? "";
          onChunk(next);
          return next;
        }
      }
    ) as never as {
      requestTaskImplementation: (
        taskId: string,
        userPrompt: string,
        plan: {
          summary: string;
          candidateFiles: string[];
          requestedPaths: string[];
          promptTerms: string[];
          workingDirectory: string;
          workspaceManifest: string[];
          workItems: Array<{ title: string; instruction: string; allowedPaths?: string[] }>;
          promptRequirements: unknown[];
          workspaceKind: "static" | "react" | "generic";
          builderMode: "notes" | "landing" | "dashboard" | "crud" | null;
        },
        workItem?: { title: string; instruction: string; allowedPaths?: string[] }
      ) => Promise<{ summary: string; edits: Array<{ path: string; content: string }> }>;
      modelRouteStats: Map<string, { successes: number; failures: number; transientFailures: number; semanticFailures: number }>;
      buildModelRouteKey: (route: { model: string; baseUrl: string; skipAuth: boolean }) => string;
    };

    const plan = {
      summary: "",
      candidateFiles: ["generated-apps/site/index.html"],
      requestedPaths: [],
      promptTerms: [],
      workingDirectory: "generated-apps/site",
      workspaceManifest: ["file: generated-apps/site/index.html"],
      workItems: [{
        title: "Implement requested changes",
        instruction: "Update the page",
        allowedPaths: ["generated-apps/site/index.html"]
      }],
      promptRequirements: [],
      workspaceKind: "static" as const,
      builderMode: null
    };

    const result = await runner.requestTaskImplementation(
      "task-1",
      "Update the page",
      plan,
      plan.workItems[0]
    );

    assert.equal(result.edits.length, 1);
    assert.equal(result.edits[0]?.path, "generated-apps/site/index.html");
    const stats = runner.modelRouteStats.get(runner.buildModelRouteKey({
      model: "first-model",
      baseUrl: "https://openrouter.ai/api/v1",
      skipAuth: false
    }));
    assert.equal(stats?.semanticFailures, 1);
  });
});

test("AgentTaskRunner rejects mixed implementation payloads with disallowed edits after retry", async () => {
  await withTempDir(async (workspaceRoot) => {
    const appDir = join(workspaceRoot, "generated-apps", "site");
    await mkdir(appDir, { recursive: true });
    await writeFile(join(appDir, "index.html"), "<h1>Old</h1>", "utf8");

    const payload = JSON.stringify({
      summary: "mixed payload",
      edits: [
        { path: "generated-apps/site/index.html", content: "<h1>New</h1>" },
        { path: "README.md", content: "# Wrong file" }
      ]
    });

    const runner = createRunnerWithServices(
      workspaceRoot,
      {
        apiKey: "test-key",
        defaultModel: "first-model",
        models: ["first-model"],
        routing: {
          default: "first-model",
          think: "first-model",
          longContext: "first-model"
        }
      },
      {
        sendMessageAdvanced: async (
          _messages: unknown,
          _model: string,
          onChunk: (chunk: string) => void
        ) => {
          onChunk(payload);
          return payload;
        }
      }
    ) as never as {
      requestTaskImplementation: (
        taskId: string,
        userPrompt: string,
        plan: {
          summary: string;
          candidateFiles: string[];
          requestedPaths: string[];
          promptTerms: string[];
          workingDirectory: string;
          workspaceManifest: string[];
          workItems: Array<{ title: string; instruction: string; allowedPaths?: string[] }>;
          promptRequirements: unknown[];
          workspaceKind: "static" | "react" | "generic";
          builderMode: "notes" | "landing" | "dashboard" | "crud" | null;
        },
        workItem?: { title: string; instruction: string; allowedPaths?: string[] }
      ) => Promise<unknown>;
      modelRouteStats: Map<string, { successes: number; failures: number; transientFailures: number; semanticFailures: number }>;
      buildModelRouteKey: (route: { model: string; baseUrl: string; skipAuth: boolean }) => string;
    };

    const plan = {
      summary: "",
      candidateFiles: ["generated-apps/site/index.html"],
      requestedPaths: [],
      promptTerms: [],
      workingDirectory: "generated-apps/site",
      workspaceManifest: ["file: generated-apps/site/index.html"],
      workItems: [{
        title: "Implement requested changes",
        instruction: "Update the page",
        allowedPaths: ["generated-apps/site/index.html"]
      }],
      promptRequirements: [],
      workspaceKind: "static" as const,
      builderMode: null
    };

    await assert.rejects(
      () => runner.requestTaskImplementation(
        "task-1",
        "Update the page",
        plan,
        plan.workItems[0]
      ),
      /Implementation model returned invalid scoped edits after retry\./
    );

    const stats = runner.modelRouteStats.get(runner.buildModelRouteKey({
      model: "first-model",
      baseUrl: "https://openrouter.ai/api/v1",
      skipAuth: false
    }));
    assert.equal(stats?.semanticFailures, 2);
  });
});

test("AgentTaskRunner accepts package-local helper files in generated node-package workspaces", async () => {
  await withTempDir(async (workspaceRoot) => {
    const appDir = join(workspaceRoot, "generated-apps", "tool");
    await mkdir(join(appDir, "src"), { recursive: true });
    await writeFile(join(appDir, "package.json"), "{\n  \"name\": \"tool\",\n  \"scripts\": {\"start\": \"node src/index.js\"}\n}\n", "utf8");
    await writeFile(join(appDir, "src", "index.js"), "console.log('old')\n", "utf8");

    const payload = JSON.stringify({
      summary: "tool update",
      edits: [
        { path: "generated-apps/tool/package.json", content: "{\n  \"name\": \"tool\",\n  \"scripts\": {\"start\": \"node src/index.js\"}\n}\n" },
        { path: "generated-apps/tool/src/index.js", content: "import { summarize } from './process-csv.js';\nconsole.log(summarize(process.argv[2] ?? ''));\n" },
        { path: "generated-apps/tool/src/process-csv.js", content: "export function summarize(input) {\n  return input ? 'ok' : 'empty';\n}\n" }
      ]
    });

    const runner = createRunnerWithServices(
      workspaceRoot,
      {
        apiKey: "test-key",
        defaultModel: "first-model",
        models: ["first-model"],
        routing: {
          default: "first-model",
          think: "first-model",
          longContext: "first-model"
        }
      },
      {
        sendMessageAdvanced: async (
          _messages: unknown,
          _model: string,
          onChunk: (chunk: string) => void
        ) => {
          onChunk(payload);
          return payload;
        }
      }
    ) as never as {
      requestTaskImplementation: (
        taskId: string,
        userPrompt: string,
        plan: {
          summary: string;
          candidateFiles: string[];
          requestedPaths: string[];
          promptTerms: string[];
          workingDirectory: string;
          workspaceManifest: string[];
          workItems: Array<{ title: string; instruction: string; allowedPaths?: string[] }>;
          promptRequirements: unknown[];
          workspaceKind: "static" | "react" | "generic";
          builderMode: "notes" | "landing" | "dashboard" | "crud" | null;
        },
        workItem?: { title: string; instruction: string; allowedPaths?: string[] }
      ) => Promise<{ edits: Array<{ path: string; content: string }> }>;
    };

    const plan = {
      summary: "",
      candidateFiles: ["generated-apps/tool/package.json", "generated-apps/tool/src/index.js"],
      requestedPaths: [],
      promptTerms: [],
      workingDirectory: "generated-apps/tool",
      workspaceManifest: ["file: generated-apps/tool/package.json", "file: generated-apps/tool/src/index.js"],
      workItems: [{
        title: "Implement requested changes",
        instruction: "Update the tool",
        allowedPaths: ["generated-apps/tool/package.json", "generated-apps/tool/src/index.js"]
      }],
      promptRequirements: [],
      workspaceKind: "generic" as const,
      builderMode: null
    };

    const result = await runner.requestTaskImplementation(
      "task-1",
      "Update the tool",
      plan,
      plan.workItems[0]
    );

    assert.equal(result.edits.length, 3);
    assert.ok(result.edits.some((edit) => edit.path === "generated-apps/tool/src/process-csv.js"));
  });
});

test("AgentTaskRunner collects generic package context files even without scoped candidates", async () => {
  await withTempDir(async (workspaceRoot) => {
    const toolDir = join(workspaceRoot, "generated-apps", "tool");
    await mkdir(join(toolDir, "src"), { recursive: true });
    await writeFile(join(toolDir, "package.json"), "{\n  \"name\": \"tool\"\n}\n", "utf8");
    await writeFile(join(toolDir, "src", "index.js"), "console.log('ok')\n", "utf8");

    const runner = createRunner(workspaceRoot) as never as {
      collectFixContextFiles: (
        buildOutput: string,
        plan?: {
          workingDirectory?: string;
          candidateFiles?: string[];
        }
      ) => Promise<Array<{ path: string; content: string }>>;
    };

    const contextFiles = await runner.collectFixContextFiles("", {
      workingDirectory: "generated-apps/tool",
      candidateFiles: []
    });

    assert.ok(contextFiles.some((file) => file.path === "generated-apps/tool/package.json"));
    assert.ok(contextFiles.some((file) => file.path === "generated-apps/tool/src/index.js"));
  });
});

test("AgentTaskRunner surfaces no-usable-edit recovery replies directly after retry", async () => {
  await withTempDir(async (workspaceRoot) => {
    const responses = [
      JSON.stringify({ summary: "noop", edits: [] }),
      JSON.stringify({ summary: "still noop", edits: [] })
    ];

    const runner = createRunnerWithServices(
      workspaceRoot,
      { apiKey: "test-key" },
      {
        sendMessageAdvanced: async (
          _messages: unknown,
          _model: unknown,
          onChunk: (chunk: string) => void
        ) => {
          onChunk(responses.shift() ?? "");
        }
      }
    ) as never as {
      requestStructuredFix: (
        taskId: string,
        userPrompt: string,
        commandResult: { combinedOutput: string },
        contextFiles: Array<{ path: string; content: string }>,
        attempt: number,
        stageLabel?: string
      ) => Promise<unknown>;
    };

    await assert.rejects(
      () => runner.requestStructuredFix(
        "task-1",
        "fix the build",
        { combinedOutput: "Build failed." },
        [],
        1,
        "Build"
      ),
      /Build recovery model returned JSON without usable edits after retry\./
    );
  });
});

test("AgentTaskRunner includes failure category guidance in structured fix prompts", async () => {
  await withTempDir(async (workspaceRoot) => {
    let capturedMessages: Array<{
      role: string;
      content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
    }> = [];
    const runner = createRunnerWithServices(
      workspaceRoot,
      { apiKey: "test-key" },
      {
        sendMessageAdvanced: async (
          messages: Array<{
            role: string;
            content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
          }>,
          _model: string,
          onChunk: (chunk: string) => void
        ) => {
          capturedMessages = messages;
          const payload = JSON.stringify({
            summary: "fixed",
            edits: [{ path: "src/App.tsx", content: "export default function App() { return null; }\n" }]
          });
          onChunk(payload);
          return payload;
        }
      }
    ) as never as {
      requestStructuredFix: (
        taskId: string,
        userPrompt: string,
        commandResult: { combinedOutput: string },
        contextFiles: Array<{ path: string; content: string }>,
        attempt: number,
        stageLabel?: string
      ) => Promise<{ edits: Array<{ path: string; content: string }> }>;
    };

    const result = await runner.requestStructuredFix(
      "task-1",
      "fix the build",
      { combinedOutput: "Build failed: Cannot find module './App'." },
      [{ path: "src/App.tsx", content: "export default function App() { return <div />; }\n" }],
      1,
      "Build"
    );

    assert.equal(result.edits.length, 1);
    const promptText = capturedMessages
      .map((message) => typeof message.content === "string"
        ? message.content
        : message.content.map((part) => part.type === "text" ? part.text : "[image]").join("\n"))
      .join("\n");
    assert.match(promptText, /Failure category: build-error/i);
    assert.match(promptText, /Focus on compile-time or bundling fixes/i);
  });
});

test("AgentTaskRunner includes task attachments in structured repair prompts and routes image tasks to vision input", async () => {
  await withTempDir(async (workspaceRoot) => {
    let capturedMessages: Array<{
      role: string;
      content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
    }> = [];
    const runner = createRunnerWithServices(
      workspaceRoot,
      { apiKey: "test-key", defaultModel: "qwen/qwen3-coder-next", models: ["qwen/qwen3-coder-next", "google/gemini-2.5-flash-lite-preview-09-2025"] },
      {
        sendMessageAdvanced: async (
          messages: Array<{
            role: string;
            content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
          }>,
          _model: string,
          onChunk: (chunk: string) => void
        ) => {
          capturedMessages = messages;
          const payload = JSON.stringify({
            summary: "fixed",
            edits: [{ path: "src/App.tsx", content: "export default function App() { return null; }\n" }]
          });
          onChunk(payload);
          return payload;
        }
      }
    ) as never as {
      tasks: Map<string, {
        id: string;
        prompt: string;
        status: string;
        createdAt: string;
        updatedAt: string;
        summary: string;
        steps: unknown[];
        attachments?: Array<{ name: string; type: "text" | "image"; content: string; mimeType?: string }>;
        telemetry: { fallbackUsed: boolean; modelAttempts: Array<{ model: string; outcome: string }> };
      }>;
      requestStructuredFix: (
        taskId: string,
        userPrompt: string,
        commandResult: { combinedOutput: string },
        contextFiles: Array<{ path: string; content: string }>,
        attempt: number,
        stageLabel?: string
      ) => Promise<{ edits: Array<{ path: string; content: string }> }>;
    };

    const now = new Date().toISOString();
    runner.tasks = new Map([[
      "task-1",
      {
        id: "task-1",
        prompt: "fix the screenshot issue",
        status: "running",
        createdAt: now,
        updatedAt: now,
        summary: "",
        steps: [],
        attachments: [
          { name: "bug.png", type: "image", content: "data:image/png;base64,YWJj", mimeType: "image/png" },
          { name: "notes.txt", type: "text", content: "Button overlaps the nav on mobile." }
        ],
        telemetry: {
          fallbackUsed: false,
          modelAttempts: []
        }
      }
    ]]) as never;

    const result = await runner.requestStructuredFix(
      "task-1",
      "fix the layout bug",
      { combinedOutput: "Preview shows overlapping controls." },
      [{ path: "src/App.tsx", content: "export default function App() { return <div />; }\n" }],
      1,
      "Preview"
    );

    assert.equal(result.edits.length, 1);
    assert.equal(capturedMessages[1]?.role, "system");
    assert.match(String(capturedMessages[1]?.content), /File: notes\.txt/);
    assert.equal(capturedMessages[2]?.role, "user");
    const userContent = capturedMessages[2]?.content;
    assert.ok(Array.isArray(userContent));
    assert.equal(userContent?.[0]?.type, "image_url");
    assert.equal(userContent?.[1]?.type, "text");
    assert.match(userContent?.[1] && "text" in userContent[1] ? userContent[1].text : "", /Task attachments: bug\.png, notes\.txt/);
  });
});

test("AgentTaskRunner advances to the next repair model route after strict contract failures", async () => {
  await withTempDir(async (workspaceRoot) => {
    const seenModels: string[] = [];
    const responsesByModel = new Map<string, string[]>([
      ["first-model", [
        "Here is the repair:\n{\"summary\":\"wrapped\",\"edits\":[{\"path\":\"file.txt\",\"content\":\"one\"}]}",
        "{\"files\":[{\"path\":\"file.txt\",\"content\":\"two\"}]}"
      ]],
      ["second-model", [
        JSON.stringify({
          summary: "fixed",
          edits: [{ path: "file.txt", content: "hello" }]
        })
      ]]
    ]);

    const runner = createRunnerWithServices(
      workspaceRoot,
      {
        apiKey: "test-key",
        defaultModel: "first-model",
        models: ["first-model", "second-model"],
        routing: {
          default: "first-model",
          think: "first-model",
          longContext: "first-model"
        }
      },
      {
        sendMessageAdvanced: async (
          _messages: unknown,
          model: string,
          onChunk: (chunk: string) => void
        ) => {
          seenModels.push(model);
          const queue = responsesByModel.get(model) ?? [];
          const next = queue.shift() ?? "";
          onChunk(next);
          return next;
        }
      }
    ) as never as {
      requestStructuredFix: (
        taskId: string,
        userPrompt: string,
        commandResult: { combinedOutput: string },
        contextFiles: Array<{ path: string; content: string }>,
        attempt: number,
        stageLabel?: string
      ) => Promise<{ edits: Array<{ path: string; content: string }> }>;
    };

    const result = await runner.requestStructuredFix(
      "task-1",
      "fix the build",
      { combinedOutput: "Build failed." },
      [{ path: "file.txt", content: "old" }],
      1,
      "Build"
    );

    assert.equal(result.edits[0]?.content, "hello");
    assert.deepEqual(seenModels, ["first-model", "first-model", "second-model"]);
  });
});

test("AgentTaskRunner advances to the next repair model route after empty responses", async () => {
  await withTempDir(async (workspaceRoot) => {
    const seenModels: string[] = [];
    const responsesByModel = new Map<string, string[]>([
      ["first-model", [""]],
      ["second-model", [
        JSON.stringify({
          summary: "fixed",
          edits: [{ path: "file.txt", content: "recovered" }]
        })
      ]]
    ]);

    const runner = createRunnerWithServices(
      workspaceRoot,
      {
        apiKey: "test-key",
        defaultModel: "first-model",
        models: ["first-model", "second-model"],
        routing: {
          default: "first-model",
          think: "first-model",
          longContext: "first-model"
        }
      },
      {
        sendMessageAdvanced: async (
          _messages: unknown,
          model: string,
          onChunk: (chunk: string) => void
        ) => {
          seenModels.push(model);
          const queue = responsesByModel.get(model) ?? [];
          const next = queue.shift() ?? "";
          onChunk(next);
          return next;
        }
      }
    ) as never as {
      requestStructuredFix: (
        taskId: string,
        userPrompt: string,
        commandResult: { combinedOutput: string },
        contextFiles: Array<{ path: string; content: string }>,
        attempt: number,
        stageLabel?: string
      ) => Promise<{ edits: Array<{ path: string; content: string }> }>;
    };

    const result = await runner.requestStructuredFix(
      "task-1",
      "fix the build",
      { combinedOutput: "Build failed." },
      [{ path: "file.txt", content: "old" }],
      1,
      "Build"
    );

    assert.equal(result.edits[0]?.content, "recovered");
    assert.deepEqual(seenModels, ["first-model", "second-model"]);
  });
});

test("AgentTaskRunner blacklists semantic no-op models after repeated structured-fix failures", async () => {
  await withTempDir(async (workspaceRoot) => {
    const seenModels: string[] = [];

    const runner = createRunnerWithServices(
      workspaceRoot,
      { apiKey: "test-key" },
      {
        sendMessageAdvanced: async (
          _messages: unknown,
          model: string,
          onChunk: (chunk: string) => void
        ) => {
          seenModels.push(model);
          const next = model === "first-model"
            ? JSON.stringify({ summary: "noop", edits: [] })
            : JSON.stringify({ summary: "fixed", edits: [{ path: "file.txt", content: "hello" }] });
          onChunk(next);
          return next;
        }
      }
    ) as never as {
      requestStructuredFix: (
        taskId: string,
        userPrompt: string,
        commandResult: { combinedOutput: string },
        contextFiles: Array<{ path: string; content: string }>,
        attempt: number,
        stageLabel?: string
      ) => Promise<{ edits: Array<{ path: string; content: string }> }>;
      tasks: Map<string, {
        id: string;
        prompt: string;
        status: string;
        createdAt: string;
        updatedAt: string;
        summary: string;
        steps: unknown[];
        telemetry: { fallbackUsed: boolean; modelAttempts: Array<{ model: string; outcome: string }> };
      }>;
      taskLogs: Map<string, string[]>;
      taskModelBlacklist: Map<string, Set<string>>;
      resolveModelRoutes: (stageLabel?: string) => Array<{ model: string; baseUrl: string; apiKey: string; skipAuth: boolean }>;
    };

    const now = new Date().toISOString();
    runner.tasks = new Map([
      ["task-1", {
        id: "task-1",
        prompt: "fix the build",
        status: "running",
        createdAt: now,
        updatedAt: now,
        summary: "",
        steps: [],
        telemetry: {
          fallbackUsed: false,
          modelAttempts: []
        }
      }]
    ]);
    runner.taskLogs = new Map([["task-1", []]]);
    runner.resolveModelRoutes = () => [
      { model: "first-model", baseUrl: "https://example.com", apiKey: "key", skipAuth: false },
      { model: "second-model", baseUrl: "https://example.com", apiKey: "key", skipAuth: false }
    ];

    const recovered = await runner.requestStructuredFix(
      "task-1",
      "fix the build",
      { combinedOutput: "Build failed." },
      [],
      1,
      "Build"
    );

    assert.equal(recovered.edits.length, 1);
    assert.deepEqual(seenModels, ["first-model", "first-model", "second-model"]);
    assert.equal(runner.taskModelBlacklist.get("task-1")?.has("first-model"), true);
    const semanticAttempts = runner.tasks.get("task-1")?.telemetry.modelAttempts.filter((attempt) => attempt.outcome === "semantic-error") ?? [];
    assert.equal(semanticAttempts.length, 2);
  });
});

test("AgentTaskRunner penalizes repair models when verification still fails after model edits", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunnerWithServices(workspaceRoot, { apiKey: "test-key" }) as never as {
      tasks: Map<string, {
        id: string;
        prompt: string;
        status: string;
        createdAt: string;
        updatedAt: string;
        summary: string;
        steps: unknown[];
        telemetry: { fallbackUsed: boolean; modelAttempts: Array<{ model: string; outcome: string; error?: string }> };
      }>;
      taskLogs: Map<string, string[]>;
      taskModelBlacklist: Map<string, Set<string>>;
      modelRouteStats: Map<string, { successes: number; failures: number; transientFailures: number; semanticFailures: number }>;
      buildModelRouteKey: (route: { model: string; baseUrl: string; skipAuth: boolean }) => string;
      rememberTaskStageRoute: (
        taskId: string,
        stage: string,
        route: { model: string; baseUrl: string; apiKey: string; skipAuth: boolean },
        routeIndex: number,
        attempt: number
      ) => void;
      recordFailedRepairVerification: (taskId: string, stageLabel: string, failureOutput: string) => void;
    };

    const now = new Date().toISOString();
    runner.tasks = new Map([
      ["task-1", {
        id: "task-1",
        prompt: "fix the build",
        status: "running",
        createdAt: now,
        updatedAt: now,
        summary: "",
        steps: [],
        telemetry: {
          fallbackUsed: false,
          modelAttempts: []
        }
      }]
    ]);
    runner.taskLogs = new Map([["task-1", []]]);

    const route = { model: "first-model", baseUrl: "https://example.com", apiKey: "key", skipAuth: false };
    runner.rememberTaskStageRoute("task-1", "Build recovery", route, 0, 1);
    runner.recordFailedRepairVerification("task-1", "Build", "Build failed: missing export");
    runner.rememberTaskStageRoute("task-1", "Build recovery", route, 0, 2);
    runner.recordFailedRepairVerification("task-1", "Build", "Build failed: missing export");

    const stats = runner.modelRouteStats.get(runner.buildModelRouteKey(route));
    assert.equal(stats?.semanticFailures, 2);
    assert.equal(runner.taskModelBlacklist.get("task-1")?.has("first-model"), true);

    const semanticAttempts = runner.tasks.get("task-1")?.telemetry.modelAttempts.filter((attempt) => attempt.outcome === "semantic-error") ?? [];
    assert.equal(semanticAttempts.length, 2);
    assert.match(semanticAttempts[0]?.error ?? "", /verification still failed after applying model edits/i);
  });
});

test("AgentTaskRunner exposes route diagnostics with scores and active task route state", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunnerWithServices(workspaceRoot) as never as {
      getRouteDiagnostics: (taskId?: string) => {
        routes: Array<{
          routeKey: string;
          model: string;
          provider: "local" | "remote";
          score: number;
          scoreFactors: Array<{ label: string; delta: number }>;
          successes: number;
          failures: number;
          transientFailures: number;
          semanticFailures: number;
        }>;
        task?: {
          taskId: string;
          blacklistedModels: string[];
          failureCounts: Array<{
            model: string;
            count: number;
            blacklisted: boolean;
            hardFailuresUntilBlacklist: number;
            transientFailuresUntilBlacklist: number;
          }>;
          visionRequested: boolean;
          activeStageRoutes: Array<{
            stage: string;
            model: string;
            provider: "local" | "remote";
            routeIndex: number;
            attempt: number;
            score: number;
            scoreFactors: Array<{ label: string; delta: number }>;
            failureCount: number;
            blacklisted: boolean;
            hardFailuresUntilBlacklist: number;
            transientFailuresUntilBlacklist: number;
            visionRequested: boolean;
            visionCapable: boolean;
            selectionReason: string;
          }>;
        };
      };
      tasks: Map<string, {
        id: string;
        prompt: string;
        status: string;
        createdAt: string;
        updatedAt: string;
        summary: string;
        steps: unknown[];
        telemetry: { fallbackUsed: boolean; modelAttempts: Array<{ model: string; outcome: string }> };
      }>;
      taskLogs: Map<string, string[]>;
      taskModelFailureCounts: Map<string, Map<string, number>>;
      taskModelBlacklist: Map<string, Set<string>>;
      modelRouteStats: Map<string, { successes: number; failures: number; transientFailures: number; semanticFailures: number; lastUsedAt?: string }>;
      buildModelRouteKey: (route: { model: string; baseUrl: string; skipAuth: boolean }) => string;
      rememberTaskStageRoute: (
        taskId: string,
        stage: string,
        route: { model: string; baseUrl: string; apiKey: string; skipAuth: boolean },
        routeIndex: number,
        attempt: number
      ) => void;
    };

    const now = new Date().toISOString();
    runner.tasks = new Map([[
      "task-1",
      {
        id: "task-1",
        prompt: "fix the build",
        status: "running",
        createdAt: now,
        updatedAt: now,
        summary: "",
        steps: [],
        telemetry: {
          fallbackUsed: false,
          modelAttempts: []
        }
      }
    ]]) as never;
    runner.taskLogs = new Map([["task-1", []]]);
    runner.taskModelFailureCounts = new Map([["task-1", new Map([["first-model", 2], ["second-model", 1]])]]);
    runner.taskModelBlacklist = new Map([["task-1", new Set(["first-model"])]]);

    const remoteRoute = { model: "first-model", baseUrl: "https://example.com", apiKey: "key", skipAuth: false };
    const localRoute = { model: "local-model", baseUrl: "http://localhost:11434/v1", apiKey: "", skipAuth: true };
    runner.modelRouteStats = new Map([
      [runner.buildModelRouteKey(remoteRoute), {
        successes: 3,
        failures: 1,
        transientFailures: 0,
        semanticFailures: 1,
        lastUsedAt: "2026-04-05T10:01:00.000Z"
      }],
      [runner.buildModelRouteKey(localRoute), {
        successes: 1,
        failures: 0,
        transientFailures: 1,
        semanticFailures: 0,
        lastUsedAt: "2026-04-05T10:02:00.000Z"
      }]
    ]);

    runner.rememberTaskStageRoute("task-1", "Build recovery", remoteRoute, 1, 2);

    const diagnostics = runner.getRouteDiagnostics("task-1");

    assert.equal(diagnostics.routes[0]?.model, "local-model");
    assert.equal(diagnostics.routes[0]?.score, 1);
    assert.deepEqual(diagnostics.routes[0]?.scoreFactors, [
      { label: "1 success", delta: 3 },
      { label: "1 transient failure", delta: -2 }
    ]);
    assert.equal(diagnostics.routes[1]?.provider, "remote");
    assert.deepEqual(diagnostics.routes[1]?.scoreFactors, [
      { label: "3 successes", delta: 9 },
      { label: "1 hard fail", delta: -4 },
      { label: "1 semantic failure", delta: -5 }
    ]);
    assert.deepEqual(diagnostics.task, {
      taskId: "task-1",
      blacklistedModels: ["first-model"],
      failureCounts: [
        {
          model: "first-model",
          count: 2,
          blacklisted: true,
          hardFailuresUntilBlacklist: 0,
          transientFailuresUntilBlacklist: 1
        },
        {
          model: "second-model",
          count: 1,
          blacklisted: false,
          hardFailuresUntilBlacklist: 1,
          transientFailuresUntilBlacklist: 2
        }
      ],
      visionRequested: false,
      activeStageRoutes: [{
        stage: "Build recovery",
        model: "first-model",
        baseUrl: "https://example.com",
        provider: "remote",
        routeIndex: 1,
        attempt: 2,
        score: 0,
        scoreFactors: [
          { label: "3 successes", delta: 9 },
          { label: "1 hard fail", delta: -4 },
          { label: "1 semantic failure", delta: -5 }
        ],
        failureCount: 2,
        blacklisted: true,
        hardFailuresUntilBlacklist: 0,
        transientFailuresUntilBlacklist: 1,
        visionRequested: false,
        visionCapable: false,
        selectionReason: "Repair stages favor coder and reasoning models. No strong capability hints were detected, so this cloud route stayed available as a fallback. It is currently using route 2, so earlier candidates already failed, were blacklisted, or ranked lower."
      }]
    });
  });
});

test("AgentTaskRunner persists task route telemetry summary across reload", async () => {
  await withTempDir(async (workspaceRoot) => {
    const now = new Date().toISOString();
    const runner = createRunnerWithServices(workspaceRoot) as never as {
      tasks: Map<string, {
        id: string;
        prompt: string;
        status: string;
        createdAt: string;
        updatedAt: string;
        summary: string;
        steps: unknown[];
        telemetry: { fallbackUsed: boolean; modelAttempts: Array<{ model: string; outcome: string }>; routeDiagnostics?: unknown };
      }>;
      taskLogs: Map<string, string[]>;
      taskModelFailureCounts: Map<string, Map<string, number>>;
      taskModelBlacklist: Map<string, Set<string>>;
      rememberTaskStageRoute: (
        taskId: string,
        stage: string,
        route: { model: string; baseUrl: string; apiKey: string; skipAuth: boolean },
        routeIndex: number,
        attempt: number
      ) => void;
      recordFailedRepairVerification: (taskId: string, stageLabel: string, failureOutput: string) => void;
      persistTaskState: () => void;
    };

    runner.tasks = new Map([[
      "task-1",
      {
        id: "task-1",
        prompt: "fix the build",
        status: "failed",
        createdAt: now,
        updatedAt: now,
        summary: "Build failed",
        steps: [],
        telemetry: {
          fallbackUsed: false,
          modelAttempts: []
        }
      }
    ]]) as never;
    runner.taskLogs = new Map([["task-1", []]]);
    runner.taskModelFailureCounts = new Map([["task-1", new Map([["first-model", 2]])]]);
    runner.taskModelBlacklist = new Map([["task-1", new Set(["first-model"])]]);

    runner.rememberTaskStageRoute("task-1", "Build recovery", {
      model: "first-model",
      baseUrl: "https://example.com",
      apiKey: "key",
      skipAuth: false
    }, 0, 2);
    runner.persistTaskState();

    const restored = createRunnerWithServices(workspaceRoot) as never as {
      getTask: (taskId: string) => {
        telemetry?: {
          routeDiagnostics?: {
            blacklistedModels: string[];
            failureCounts: Array<{
              model: string;
              count: number;
              blacklisted: boolean;
              hardFailuresUntilBlacklist: number;
              transientFailuresUntilBlacklist: number;
            }>;
            visionRequested: boolean;
            activeStageRoutes: Array<{
              stage: string;
              model: string;
              routeIndex: number;
              attempt: number;
              score: number;
              scoreFactors: Array<{ label: string; delta: number }>;
              failureCount: number;
              blacklisted: boolean;
              hardFailuresUntilBlacklist: number;
              transientFailuresUntilBlacklist: number;
              visionRequested: boolean;
              visionCapable: boolean;
              selectionReason: string;
            }>;
          };
        };
      } | null;
    };

    const telemetry = restored.getTask("task-1")?.telemetry;
    assert.deepEqual(telemetry?.routeDiagnostics, {
      blacklistedModels: ["first-model"],
      failureCounts: [{
        model: "first-model",
        count: 2,
        blacklisted: true,
        hardFailuresUntilBlacklist: 0,
        transientFailuresUntilBlacklist: 1
      }],
      visionRequested: false,
      activeStageRoutes: [{
        stage: "Build recovery",
        model: "first-model",
        baseUrl: "https://example.com",
        provider: "remote",
        routeIndex: 0,
        attempt: 2,
        score: 0,
        scoreFactors: [{ label: "No reliability history", delta: 0 }],
        failureCount: 2,
        blacklisted: true,
        hardFailuresUntilBlacklist: 0,
        transientFailuresUntilBlacklist: 1,
        visionRequested: false,
        visionCapable: false,
        selectionReason: "Repair stages favor coder and reasoning models. No strong capability hints were detected, so this cloud route stayed available as a fallback. It is currently the top remaining route for this stage."
      }]
    });
  });
});

test("AgentTaskRunner remembers recurring repair failures as reusable memory", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunnerWithServices(workspaceRoot) as never as {
      tasks: Map<string, {
        id: string;
        prompt: string;
        status: string;
        createdAt: string;
        updatedAt: string;
        summary: string;
        steps: unknown[];
        artifactType?: string;
        telemetry: { fallbackUsed: boolean; modelAttempts: Array<{ model: string; outcome: string; error?: string }> };
      }>;
      taskLogs: Map<string, string[]>;
      failureMemory: Map<string, {
        category: string;
        signature: string;
        guidance: string;
        count: number;
        artifactType: string;
      }>;
      rememberTaskStageRoute: (
        taskId: string,
        stage: string,
        route: { model: string; baseUrl: string; apiKey: string; skipAuth: boolean },
        routeIndex: number,
        attempt: number
      ) => void;
      recordFailedRepairVerification: (taskId: string, stageLabel: string, failureOutput: string) => void;
    };

    const now = new Date().toISOString();
    runner.tasks = new Map([[
      "task-1",
      {
        id: "task-1",
        prompt: "Create a JSON audit CLI tool.",
        status: "running",
        createdAt: now,
        updatedAt: now,
        summary: "",
        steps: [],
        artifactType: "script-tool",
        telemetry: {
          fallbackUsed: false,
          modelAttempts: []
        }
      }
    ]]) as never;
    runner.taskLogs = new Map([["task-1", []]]);

    const route = { model: "repair-model", baseUrl: "https://example.com", apiKey: "key", skipAuth: false };
    runner.rememberTaskStageRoute("task-1", "Build recovery", route, 0, 1);
    runner.recordFailedRepairVerification("task-1", "Build", "CLI runtime still returned usage guidance instead of completing a real probe run.");
    runner.rememberTaskStageRoute("task-1", "Build recovery", route, 0, 2);
    runner.recordFailedRepairVerification("task-1", "Build", "CLI runtime still returned usage guidance instead of completing a real probe run.");

    const memory = [...runner.failureMemory.values()];
    assert.equal(memory.length > 0, true);
    assert.equal(memory[0]?.count, 2);
    assert.equal(memory[0]?.artifactType, "script-tool");
    assert.equal(memory[0]?.signature, "cli-usage-output");
    assert.match(memory[0]?.guidance ?? "", /real output, not just usage text/i);
  });
});

test("AgentTaskRunner persists failure memory across reload", async () => {
  await withTempDir(async (workspaceRoot) => {
    const now = new Date().toISOString();
    const runner = createRunnerWithServices(workspaceRoot) as never as {
      tasks: Map<string, {
        id: string;
        prompt: string;
        status: string;
        createdAt: string;
        updatedAt: string;
        summary: string;
        steps: unknown[];
        artifactType?: string;
        telemetry: { fallbackUsed: boolean; modelAttempts: Array<{ model: string; outcome: string; error?: string }> };
      }>;
      taskLogs: Map<string, string[]>;
      rememberTaskStageRoute: (
        taskId: string,
        stage: string,
        route: { model: string; baseUrl: string; apiKey: string; skipAuth: boolean },
        routeIndex: number,
        attempt: number
      ) => void;
      recordFailedRepairVerification: (taskId: string, stageLabel: string, failureOutput: string) => void;
      persistTaskState: () => void;
    };

    runner.tasks = new Map([[
      "task-1",
      {
        id: "task-1",
        prompt: "Create an API service with health and records routes.",
        status: "failed",
        createdAt: now,
        updatedAt: now,
        summary: "Repair failed",
        steps: [],
        artifactType: "api-service",
        telemetry: {
          fallbackUsed: false,
          modelAttempts: []
        }
      }
    ]]) as never;
    runner.taskLogs = new Map([["task-1", []]]);
    runner.rememberTaskStageRoute("task-1", "Launch recovery", {
      model: "repair-model",
      baseUrl: "https://example.com",
      apiKey: "key",
      skipAuth: false
    }, 0, 1);
    runner.recordFailedRepairVerification("task-1", "Launch", "Health probe failed at http://127.0.0.1:3000/health: HTTP 500");
    runner.persistTaskState();

    const restored = createRunnerWithServices(workspaceRoot) as never as {
      failureMemory: Map<string, { signature: string; artifactType: string; count: number }>;
    };

    const memory = [...restored.failureMemory.values()];
    assert.equal(memory.length > 0, true);
    assert.equal(memory[0]?.artifactType, "api-service");
    assert.equal(memory[0]?.count, 1);
    assert.equal(memory[0]?.signature, "api-runtime-endpoints");
  });
});

test("AgentTaskRunner includes relevant failure memory in structured repair prompts", async () => {
  await withTempDir(async (workspaceRoot) => {
    const runner = createRunnerWithServices(workspaceRoot) as never as {
      tasks: Map<string, {
        id: string;
        prompt: string;
        status: string;
        createdAt: string;
        updatedAt: string;
        summary: string;
        steps: unknown[];
        artifactType?: string;
        telemetry: { fallbackUsed: boolean; modelAttempts: Array<{ model: string; outcome: string; error?: string }> };
      }>;
      taskLogs: Map<string, string[]>;
      rememberTaskStageRoute: (
        taskId: string,
        stage: string,
        route: { model: string; baseUrl: string; apiKey: string; skipAuth: boolean },
        routeIndex: number,
        attempt: number
      ) => void;
      recordFailedRepairVerification: (taskId: string, stageLabel: string, failureOutput: string) => void;
      requestStructuredFix: (
        taskId: string,
        userPrompt: string,
        commandResult: {
          combinedOutput: string;
          ok: boolean;
          code: number | null;
          signal: string | null;
          stdout: string;
          stderr: string;
          durationMs: number;
          timedOut: boolean;
          commandLine: string;
          cwd: string;
        },
        contextFiles: Array<{ path: string; content: string }>,
        attempt: number,
        stageLabel?: string,
        plan?: unknown
      ) => Promise<{ summary: string; edits: Array<{ path: string; content: string }> }>;
      sendFixModelRequest: (
        taskId: string,
        routes: unknown[],
        messages: Array<{ role: string; content: string }>
      ) => Promise<string>;
      resolveModelRoutes: () => Array<{ model: string; baseUrl: string; apiKey: string; skipAuth: boolean }>;
      appendLog: (taskId: string, line: string) => void;
    };

    const now = new Date().toISOString();
    runner.tasks = new Map([[
      "task-1",
      {
        id: "task-1",
        prompt: "Create a JSON audit CLI tool.",
        status: "running",
        createdAt: now,
        updatedAt: now,
        summary: "",
        steps: [],
        artifactType: "script-tool",
        telemetry: {
          fallbackUsed: false,
          modelAttempts: []
        }
      }
    ]]) as never;
    runner.taskLogs = new Map([["task-1", []]]);
    runner.appendLog = () => {};
    runner.resolveModelRoutes = () => [{ model: "repair-model", baseUrl: "https://example.com", apiKey: "key", skipAuth: false }];
    runner.rememberTaskStageRoute("task-1", "Build recovery", {
      model: "repair-model",
      baseUrl: "https://example.com",
      apiKey: "key",
      skipAuth: false
    }, 0, 1);
    runner.recordFailedRepairVerification("task-1", "Build", "CLI runtime still returned usage guidance instead of completing a real probe run.");
    runner.rememberTaskStageRoute("task-1", "Build recovery", {
      model: "repair-model",
      baseUrl: "https://example.com",
      apiKey: "key",
      skipAuth: false
    }, 0, 2);
    runner.recordFailedRepairVerification("task-1", "Build", "CLI runtime still returned usage guidance instead of completing a real probe run.");

    let captured = "";
    runner.sendFixModelRequest = async (_taskId, _routes, messages) => {
      captured = messages.map((message) => message.content).join("\n");
      return "{\"summary\":\"ok\",\"edits\":[{\"path\":\"generated-apps/tool/README.md\",\"content\":\"# Tool\\n\"}]}";
    };

    const result = await runner.requestStructuredFix(
      "task-1",
      "Repair the generated CLI tool.",
      {
        combinedOutput: "CLI runtime still returned usage guidance instead of completing a real probe run.",
        ok: false,
        code: 1,
        signal: null,
        stdout: "",
        stderr: "usage",
        durationMs: 0,
        timedOut: false,
        commandLine: "npm start",
        cwd: workspaceRoot
      },
      [{ path: "generated-apps/tool/src/index.js", content: "console.log('usage');\n" }],
      1,
      "Build",
      {
        repositoryContext: {
          summary: "Single-package Node workspace.",
          workspaceShape: "single-package",
          packageManager: "npm",
          languageStyle: "javascript",
          moduleFormat: "esm",
          uiFramework: "none",
          styling: "unknown",
          testing: "node:test",
          linting: "none",
          conventions: []
        },
        spec: {
          starterProfile: "node-cli"
        }
      }
    );

    assert.equal(result.edits.length, 1);
    assert.match(captured, /Recurring failure memory:/);
    assert.match(captured, /cli-usage-output/);
    assert.match(captured, /real output, not just usage text/i);
  });
});
