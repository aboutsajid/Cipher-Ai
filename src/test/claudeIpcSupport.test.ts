import test from "node:test";
import assert from "node:assert/strict";
import { buildClaudeConversationPrompt, sendClaudePrompt } from "../main/claudeIpcSupport";
import type { ClaudeSessionResult, ClaudeSessionStatus } from "../main/claudeSupport";
import type { ClaudeChatFilesystemSettings } from "../shared/types";

function createClaudeManager() {
  const calls: Array<{
    prompt: string;
    enabledTools: string[];
    attachmentCount: number;
    filesystemAccess?: ClaudeChatFilesystemSettings;
  }> = [];
  return {
    calls,
    status: (): ClaudeSessionStatus => ({
      running: false,
      model: "minimax-m2.5:cloud"
    }),
    sendPrompt: (
      prompt: string,
      attachments: unknown[],
      enabledTools: string[],
      options?: { filesystemAccess?: ClaudeChatFilesystemSettings }
    ): ClaudeSessionResult => {
      calls.push({
        prompt,
        enabledTools,
        attachmentCount: attachments.length,
        filesystemAccess: options?.filesystemAccess
      });
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
  assert.equal(manager.calls.length, 1);
  assert.deepEqual(manager.calls[0], {
    prompt: `You are in Cipher Workspace Claude chat mode.

Do not inspect your current working directory, parent directories, git state, or local files unless the app explicitly grants filesystem access for this turn and the user clearly asks for it.

Do not assume the app's own repo or runtime directory is the user's target project.

Continue the same conversation using the saved chat transcript below.

Stay on the current subject unless the latest user message clearly starts a new topic.

Respond directly to the latest user message. Do not ask what to do next when the latest message is already a follow-up.

[Filesystem access]

No app-approved filesystem access is available for this turn.

If the user wants you to inspect local files or a project folder, ask them to specify the target and enable approved-folder access.

[Latest user message]

Please review the attached files and summarize important points.`,
    enabledTools: ["workspace.search"],
    attachmentCount: 1,
    filesystemAccess: undefined
  });
});

test("buildClaudeConversationPrompt carries forward prior chat context and isolates the latest user turn", () => {
  const prompt = buildClaudeConversationPrompt("What should we change next?", {
    systemPrompt: "Stay concise.",
    history: [
      { role: "user", content: "We are discussing the billing page." },
      { role: "assistant", content: "The invoice summary is misaligned." },
      { role: "user", content: "What should we change next?" }
    ]
  });

  assert.match(prompt, /\[System prompt\]/);
  assert.match(prompt, /Stay concise\./);
  assert.match(prompt, /\[Conversation transcript\]/);
  assert.match(prompt, /User:\nWe are discussing the billing page\./);
  assert.match(prompt, /Assistant:\nThe invoice summary is misaligned\./);
  assert.doesNotMatch(prompt, /User:\nWhat should we change next\?\n\n\[Latest user message\]/);
  assert.match(prompt, /\[Latest user message\]\n\nWhat should we change next\?/);
  assert.match(prompt, /Do not inspect your current working directory/i);
});

test("buildClaudeConversationPrompt carries Claude filesystem breadcrumbs for continuation turns", () => {
  const prompt = buildClaudeConversationPrompt("continue generating the remaining files", {
    history: [
      { role: "user", content: "Create the project inside D:\\Cipher Agent." },
      { role: "system", content: "[Claude filesystem] writing D:\\Cipher Agent\\pc-agent\\README.md" },
      { role: "system", content: "Claude Code session started." },
      { role: "assistant", content: "I hit a rate limit before finishing." },
      { role: "user", content: "continue generating the remaining files" }
    ]
  }, {
    roots: ["D:\\Cipher Agent"],
    allowWrite: true
  });

  assert.match(prompt, /\[Conversation transcript\]/);
  assert.match(prompt, /App:\n\[Claude filesystem\] writing D:\\Cipher Agent\\pc-agent\\README\.md/);
  assert.doesNotMatch(prompt, /Claude Code session started\./);
  assert.doesNotMatch(prompt, /User:\ncontinue generating the remaining files\n\n\[Approved Claude chat filesystem access\]/);
  assert.match(prompt, /\[Latest user message\]\n\ncontinue generating the remaining files/);
});

test("sendClaudePrompt does not expose filesystem tools for vague project questions", () => {
  const manager = createClaudeManager();
  const result = sendClaudePrompt(manager as never, "I have a project, needs improvements.", {
    filesystemAccess: {
      roots: ["D:\\Antigravity\\Cipher Ai"],
      allowWrite: true
    }
  });

  assert.equal(result.ok, true);
  assert.equal(manager.calls.length, 1);
  assert.equal(manager.calls[0].filesystemAccess, undefined);
  assert.doesNotMatch(manager.calls[0].prompt, /\[Approved Claude chat filesystem access\]/);
});

test("buildClaudeConversationPrompt tells Claude to ask before inspecting approved folders", () => {
  const prompt = buildClaudeConversationPrompt(
    "Please inspect the approved project and summarize the architecture.",
    undefined,
    {
      roots: ["D:\\Antigravity\\Cipher Ai"],
      allowWrite: false
    }
  );

  assert.match(prompt, /\[Approved Claude chat filesystem access\]/);
  assert.match(prompt, /Do not inspect any approved folder or project just because access exists\./);
  assert.match(prompt, /ask one short clarification question first/i);
  assert.match(prompt, /Never assume the app's own workspace is the user's target project\./);
  assert.match(prompt, /You do not have bash, shell, or terminal access in this chat runtime/i);
  assert.match(prompt, /Do not describe them as missing native Claude tools/i);
  assert.match(prompt, /write_files/);
  assert.match(prompt, /write_plan/);
});

test("sendClaudePrompt exposes approved-folder access for explicit allowed-folder requests", () => {
  const manager = createClaudeManager();
  const result = sendClaudePrompt(manager as never, "access to the allowed folder and tell me whats inside", {
    filesystemAccess: {
      roots: ["C:\\Users\\about\\OneDrive\\Desktop\\American Enigmas"],
      allowWrite: true
    }
  });

  assert.equal(result.ok, true);
  assert.equal(manager.calls.length, 1);
  assert.deepEqual(manager.calls[0].filesystemAccess, {
    roots: ["C:\\Users\\about\\OneDrive\\Desktop\\American Enigmas"],
    allowWrite: true
  });
  assert.match(manager.calls[0].prompt, /\[Approved Claude chat filesystem access\]/);
  assert.match(manager.calls[0].prompt, /\[Approved folder alias\]/);
  assert.match(manager.calls[0].prompt, /American Enigmas/);
});

test("sendClaudePrompt exposes approved-folder access for project scaffolding in the selected folder", () => {
  const manager = createClaudeManager();
  const result = sendClaudePrompt(manager as never, "Create an entire React project in the selected folder.", {
    filesystemAccess: {
      roots: ["D:\\Cipher Agent"],
      allowWrite: true
    }
  });

  assert.equal(result.ok, true);
  assert.equal(manager.calls.length, 1);
  assert.deepEqual(manager.calls[0].filesystemAccess, {
    roots: ["D:\\Cipher Agent"],
    allowWrite: true
  });
  assert.match(manager.calls[0].prompt, /Write access is enabled inside those approved folders\. You may scaffold or update a complete project there\./);
  assert.match(manager.calls[0].prompt, /"the allowed folder", "the approved folder", and "the selected folder"/);
  assert.match(manager.calls[0].prompt, /write_files/);
});

test("sendClaudePrompt keeps approved-folder access for follow-up write requests in the same project thread", () => {
  const manager = createClaudeManager();
  const result = sendClaudePrompt(manager as never, "try to write now", {
    filesystemAccess: {
      roots: ["D:\\Cipher Agent"],
      allowWrite: true
    },
    conversation: {
      history: [
        { role: "user", content: "Create the full project inside the selected folder D:\\Cipher Agent." },
        { role: "assistant", content: "I still don't have filesystem access to D:\\Cipher Agent yet." }
      ]
    }
  });

  assert.equal(result.ok, true);
  assert.equal(manager.calls.length, 1);
  assert.deepEqual(manager.calls[0].filesystemAccess, {
    roots: ["D:\\Cipher Agent"],
    allowWrite: true
  });
  assert.match(manager.calls[0].prompt, /\[Approved Claude chat filesystem access\]/);
  assert.match(manager.calls[0].prompt, /approved access block as the current source of truth/i);
});

test("sendClaudePrompt keeps approved-folder access for short continuation prompts after an access-related denial", () => {
  const manager = createClaudeManager();
  const result = sendClaudePrompt(manager as never, "continue", {
    filesystemAccess: {
      roots: ["D:\\Cipher Agent"],
      allowWrite: true
    },
    conversation: {
      history: [
        { role: "user", content: "Please scaffold the app in the approved folder." },
        { role: "assistant", content: "I still don't have filesystem access to D:\\Cipher Agent. Grant access and I will create the files." }
      ]
    }
  });

  assert.equal(result.ok, true);
  assert.equal(manager.calls.length, 1);
  assert.deepEqual(manager.calls[0].filesystemAccess, {
    roots: ["D:\\Cipher Agent"],
    allowWrite: true
  });
  assert.match(manager.calls[0].prompt, /\[Approved Claude chat filesystem access\]/);
});

test("buildClaudeConversationPrompt includes overwrite policy and budgets when configured", () => {
  const prompt = buildClaudeConversationPrompt(
    "Create a project in the selected folder.",
    undefined,
    {
      roots: ["D:\\Cipher Agent"],
      allowWrite: true,
      overwritePolicy: "create-only",
      budgets: {
        maxFilesPerTurn: 12,
        maxBytesPerTurn: 64000,
        maxToolCallsPerTurn: 6
      }
    }
  );

  assert.match(prompt, /Overwrite policy: create-only/);
  assert.match(prompt, /Per-turn budgets: max files 12, max bytes 64000, max tool calls 6/);
  assert.match(prompt, /\[Scaffold expectations\]/);
});
