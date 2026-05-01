import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AttachmentPayload } from "../shared/types";

function readProjectFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function readRendererRuntimeSource(): string {
  return [
    readProjectFile("dist/renderer/app.js"),
    readProjectFile("dist/renderer/appClaudeSafetyUiUtils.js")
  ].join("\n");
}

function extractFunctionSource(source: string, functionName: string): string {
  const marker = `function ${functionName}`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `expected to find ${functionName} in renderer source`);

  const braceStart = source.indexOf("{", start);
  assert.notEqual(braceStart, -1, `expected to find opening brace for ${functionName}`);

  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const ch = source[index];
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  throw new Error(`Failed to extract ${functionName} from renderer source.`);
}

function loadManagedWriteDetector(): (prompt: string, attachments?: AttachmentPayload[]) => boolean {
  const rendererSource = readRendererRuntimeSource();
  const functionSource = extractFunctionSource(rendererSource, "isClaudeManagedWriteRequest");
  const factory = new Function(
    "getEditableSourcePaths",
    "getWritableRootPaths",
    `${functionSource}; return isClaudeManagedWriteRequest;`
  ) as (
    getEditableSourcePaths: (attachments: AttachmentPayload[]) => string[],
    getWritableRootPaths: (attachments: AttachmentPayload[]) => string[]
  ) => (prompt: string, attachments?: AttachmentPayload[]) => boolean;

  return factory(
    (attachments) => attachments
      .map((attachment) => (attachment.sourcePath ?? "").trim())
      .filter(Boolean),
    (attachments) => attachments
      .map((attachment) => (attachment.writableRoot ?? "").trim())
      .filter(Boolean)
  );
}

function loadFilesystemFlowPreference(): (
  prompt: string,
  filesystem?: {
    roots?: string[];
    allowWrite?: boolean;
    overwritePolicy?: "create-only" | "allow-overwrite" | "ask-before-overwrite";
    rootConfigs?: Array<{
      path?: string;
      label?: string;
      allowWrite?: boolean;
      overwritePolicy?: "create-only" | "allow-overwrite" | "ask-before-overwrite";
    }>;
  }
) => boolean {
  const rendererSource = readRendererRuntimeSource();
  const functionSource = extractFunctionSource(rendererSource, "shouldPreferClaudeFilesystemProjectFlow");
  const factory = new Function(
    "normalizeClaudeChatFilesystemRootDrafts",
    `${functionSource}; return shouldPreferClaudeFilesystemProjectFlow;`
  ) as (
    normalizeClaudeChatFilesystemRootDrafts: (
      items?: Array<{
        path?: string;
        label?: string;
        allowWrite?: boolean;
        overwritePolicy?: "create-only" | "allow-overwrite" | "ask-before-overwrite";
      }>,
      defaultAllowWrite?: boolean,
      defaultOverwritePolicy?: "create-only" | "allow-overwrite" | "ask-before-overwrite"
    ) => Array<{
      path: string;
      label: string;
      allowWrite: boolean;
      overwritePolicy: "create-only" | "allow-overwrite" | "ask-before-overwrite";
    }>
  ) => (
    prompt: string,
    filesystem?: {
      roots?: string[];
      allowWrite?: boolean;
      overwritePolicy?: "create-only" | "allow-overwrite" | "ask-before-overwrite";
      rootConfigs?: Array<{
        path?: string;
        label?: string;
        allowWrite?: boolean;
        overwritePolicy?: "create-only" | "allow-overwrite" | "ask-before-overwrite";
      }>;
    }
  ) => boolean;

  return factory((items, defaultAllowWrite, defaultOverwritePolicy) => (items ?? [])
    .map((item) => {
      const overwritePolicy: "create-only" | "allow-overwrite" | "ask-before-overwrite" =
        item?.overwritePolicy === "create-only" || item?.overwritePolicy === "ask-before-overwrite"
          ? item.overwritePolicy
          : defaultOverwritePolicy === "create-only" || defaultOverwritePolicy === "ask-before-overwrite"
            ? defaultOverwritePolicy
            : "allow-overwrite";
      return {
        path: String(item?.path ?? "").trim(),
        label: String(item?.label ?? "").trim(),
        allowWrite: item?.allowWrite !== false && defaultAllowWrite !== false,
        overwritePolicy
      };
    })
    .filter((item) => item.path));
}

test("Claude managed write intent triggers for explicit file edit requests", () => {
  const shouldTrigger = loadManagedWriteDetector();

  assert.equal(shouldTrigger("Please update src/renderer/app.ts to rename the button label."), true);
  assert.equal(shouldTrigger("Create a small Node tool in this workspace to summarize logs."), true);
});

test("Claude managed write intent does not trigger for plain path references without a request", () => {
  const shouldTrigger = loadManagedWriteDetector();

  assert.equal(shouldTrigger("The output file is located at src/renderer/app.ts."), false);
});

test("Claude managed write intent still supports attached-file edit requests", () => {
  const shouldTrigger = loadManagedWriteDetector();
  const attachments: AttachmentPayload[] = [
    {
      name: "app.ts",
      type: "text",
      content: "console.log('hi');",
      sourcePath: "src/renderer/app.ts"
    }
  ];

  assert.equal(shouldTrigger("Edit the attached file and save the fix.", attachments), true);
});

test("Claude managed write intent ignores pasted status reports with paths and file summaries", () => {
  const shouldTrigger = loadManagedWriteDetector();
  const pastedStatusReport = `
The remaining work is done. I trained a new Urdu GPT-SoVITS v2 experiment and verified real synthesis.
Key outputs:
SoVITS: D:\\GPT-SoVITS\\SoVITS_weights_v2\\urdu_speaker_v6_e8_s240.pth
GPT: D:\\GPT-SoVITS\\GPT_weights_v2\\urdu_speaker_v6-e15.ckpt
I also added a repeatable launcher at training/urdu-gptsovits/scripts/run_gptsovits_v2_pipeline.py and updated SESSION_STATUS.md.
2 files changed
Result: No file changes were returned.
If you want, I can clean up the generated artifacts and prepare a commit.
  `.trim();

  assert.equal(shouldTrigger(pastedStatusReport), false);
});

test("Claude chat prefers filesystem tool flow for approved-folder project scaffolds", () => {
  const shouldPreferFilesystemFlow = loadFilesystemFlowPreference();

  assert.equal(
    shouldPreferFilesystemFlow("Create the full Python agent project in the approved folder D:\\Cipher Agent.", {
      roots: ["D:\\Cipher Agent"],
      allowWrite: true
    }),
    true
  );
});

test("Claude chat keeps managed-write flow for normal workspace edit requests", () => {
  const shouldPreferFilesystemFlow = loadFilesystemFlowPreference();

  assert.equal(
    shouldPreferFilesystemFlow("Please update src/renderer/app.ts to rename the button label.", {
      roots: ["D:\\Cipher Agent"],
      allowWrite: true
    }),
    false
  );
});
