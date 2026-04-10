import test from "node:test";
import assert from "node:assert/strict";
import {
  buildManagedWriteVerificationPrompt,
  collectManagedWriteLocalFindings,
  parseManagedWriteVerificationResponse,
  verifyManagedWriteProposal
} from "../main/managedWriteVerificationSupport";
import type { Settings } from "../shared/types";

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

test("collectManagedWriteLocalFindings catches malformed json and duplicate paths", () => {
  const findings = collectManagedWriteLocalFindings([
    { path: "D:\\project\\package.json", content: "{ invalid json" },
    { path: "D:\\project\\package.json", content: "{}" }
  ]);

  assert.equal(findings.some((finding) => finding.severity === "error" && /Invalid JSON content/i.test(finding.message)), true);
  assert.equal(findings.some((finding) => finding.severity === "warn" && /duplicate edits/i.test(finding.message)), true);
});

test("parseManagedWriteVerificationResponse extracts json from mixed text", () => {
  const parsed = parseManagedWriteVerificationResponse(
    'Verifier output:\n{"status":"warning","summary":"Manifest looks risky.","findings":[{"severity":"warn","path":"D:\\\\project\\\\package.json","message":"Scripts look incomplete."}]}'
  );

  assert.deepEqual(parsed, {
    status: "warning",
    summary: "Manifest looks risky.",
    findings: [
      {
        severity: "warn",
        path: "D:\\project\\package.json",
        message: "Scripts look incomplete."
      }
    ]
  });
});

test("verifyManagedWriteProposal blocks malformed json even when model passes", async () => {
  const report = await verifyManagedWriteProposal(
    createSettings(),
    async (_history, _model, onChunk) => {
      onChunk('{"status":"passed","summary":"Looks fine.","findings":[]}');
    },
    [{ path: "D:\\project\\package.json", content: "{ invalid json" }]
  );

  assert.equal(report.status, "blocked");
  assert.equal(report.ok, false);
  assert.equal(report.findings.some((finding) => finding.severity === "error"), true);
});

test("verifyManagedWriteProposal skips cleanly when no utility route is available", async () => {
  const report = await verifyManagedWriteProposal(
    createSettings({ apiKey: "", ollamaEnabled: false, defaultModel: "", models: [] }),
    async () => {
      throw new Error("should not be called");
    },
    [{ path: "D:\\project\\README.md", content: "# Demo\n" }]
  );

  assert.equal(report.status, "skipped");
  assert.equal(report.ok, true);
});

test("buildManagedWriteVerificationPrompt includes file paths", () => {
  const prompt = buildManagedWriteVerificationPrompt([
    { path: "D:\\project\\README.md", content: "# Demo\n" }
  ]);

  assert.match(prompt, /Verify this Claude managed-write proposal/i);
  assert.match(prompt, /D:\\project\\README\.md/i);
});
