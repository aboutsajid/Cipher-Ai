import test from "node:test";
import assert from "node:assert/strict";
import { sendClaudePrompt } from "../main/claudeIpcSupport";
import type { ClaudeSessionResult, ClaudeSessionStatus } from "../main/claudeSupport";

function createClaudeManager() {
  const calls: Array<{ prompt: string; enabledTools: string[]; attachmentCount: number }> = [];
  return {
    calls,
    status: (): ClaudeSessionStatus => ({
      running: false,
      model: "minimax-m2.5:cloud"
    }),
    sendPrompt: (prompt: string, attachments: unknown[], enabledTools: string[]): ClaudeSessionResult => {
      calls.push({ prompt, enabledTools, attachmentCount: attachments.length });
      return {
        ok: true,
        message: "Prompt sent.",
        running: true,
        model: "minimax-m2.5:cloud"
      };
    }
  };
}

test("sendClaudePrompt rejects fully empty requests", () => {
  const manager = createClaudeManager();
  const result = sendClaudePrompt(manager as never, "   ", { attachments: [], enabledTools: [] });

  assert.deepEqual(result, {
    ok: false,
    message: "Prompt is empty.",
    running: false,
    model: "minimax-m2.5:cloud"
  });
  assert.equal(manager.calls.length, 0);
});

test("sendClaudePrompt normalizes attachments and uses fallback prompt", () => {
  const manager = createClaudeManager();
  const result = sendClaudePrompt(manager as never, "   ", {
    attachments: [{ name: " note.md ", type: "text", content: "hello" }],
    enabledTools: [" workspace.search ", ""]
  });

  assert.equal(result.ok, true);
  assert.deepEqual(manager.calls, [{
    prompt: "Please review the attached files and summarize important points.",
    enabledTools: ["workspace.search"],
    attachmentCount: 1
  }]);
});
