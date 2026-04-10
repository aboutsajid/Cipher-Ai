import test from "node:test";
import assert from "node:assert/strict";
import {
  buildManagedWriteRepairPrompt,
  parseManagedWriteRepairResponse,
  repairManagedWriteProposal
} from "../main/managedWriteRepairSupport";
import type { ManagedWriteVerificationReport, Settings } from "../shared/types";

function createSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    apiKey: "key-123",
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
    ...overrides
  };
}

function createBlockedVerification(): ManagedWriteVerificationReport {
  return {
    ok: false,
    status: "blocked",
    summary: "Manifest is malformed.",
    findings: [
      {
        severity: "error",
        path: "D:\\project\\package.json",
        message: "Invalid JSON content."
      }
    ],
    reviewerModel: "qwen/qwen3-coder:free"
  };
}

test("parseManagedWriteRepairResponse extracts edit json", () => {
  const parsed = parseManagedWriteRepairResponse(
    'repair:\n{"summary":"Fixed package.json escaping.","edits":[{"path":"D:\\\\project\\\\package.json","content":"{}\\n"}]}'
  );

  assert.deepEqual(parsed, {
    summary: "Fixed package.json escaping.",
    edits: [
      {
        path: "D:\\project\\package.json",
        content: "{}\n"
      }
    ]
  });
});

test("buildManagedWriteRepairPrompt includes blocked findings and allowed paths", () => {
  const prompt = buildManagedWriteRepairPrompt(
    [{ path: "D:\\project\\package.json", content: "{ invalid json" }],
    createBlockedVerification()
  );

  assert.match(prompt, /Repair this blocked Claude managed-write proposal/i);
  assert.match(prompt, /Invalid JSON content/i);
  assert.match(prompt, /D:\\project\\package\.json/i);
});

test("repairManagedWriteProposal returns repaired edits when model complies", async () => {
  const result = await repairManagedWriteProposal(
    createSettings(),
    async (_history, _model, onChunk) => {
      onChunk('{"summary":"Fixed package.json.","edits":[{"path":"D:\\\\project\\\\package.json","content":"{}\\n"}]}');
    },
    [{ path: "D:\\project\\package.json", content: "{ invalid json" }],
    createBlockedVerification()
  );

  assert.equal(result.ok, true);
  assert.equal(result.edits.length, 1);
  assert.equal(result.summary, "Fixed package.json.");
});

test("repairManagedWriteProposal reports invalid repair payloads", async () => {
  const result = await repairManagedWriteProposal(
    createSettings(),
    async (_history, _model, onChunk) => {
      onChunk("not valid json");
    },
    [{ path: "D:\\project\\package.json", content: "{ invalid json" }],
    createBlockedVerification()
  );

  assert.equal(result.ok, false);
  assert.equal(result.error, "invalid-json");
});
