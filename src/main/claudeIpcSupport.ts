import { normalizeAttachments } from "./attachmentSupport";
import type { AttachmentPayload, ClaudeChatFilesystemSettings } from "../shared/types";
import type { ClaudeSessionManager } from "./claudeSupport";

interface ClaudeConversationContext {
  systemPrompt?: string;
  history?: Array<{ role: string; content: string }>;
}

interface ClaudeSendOptions {
  attachments?: AttachmentPayload[];
  enabledTools?: string[];
  includeFullTextAttachments?: boolean;
  conversation?: ClaudeConversationContext;
  filesystemAccess?: ClaudeChatFilesystemSettings;
}

export function shouldExposeClaudeChatFilesystem(
  prompt: string,
  attachments: AttachmentPayload[] = [],
  conversation?: ClaudeConversationContext
): boolean {
  const normalized = (prompt ?? "").trim().toLowerCase();
  if (!normalized) return false;

  const hasExplicitPathHint = /([a-z]:\\|\\\\|\/|[a-z0-9._-]+\.[a-z0-9]+)\S*/i.test(prompt ?? "");
  const hasFileTarget = /\b(file|files|folder|folders|directory|directories|path|paths|root|roots|source code|codebase|code)\b/.test(normalized);
  const hasProjectTarget = /\b(project|repo|repository|workspace)\b/.test(normalized);
  const hasApprovedFolderReference = /\b(allowed|approved)\s+(file|files|folder|folders|directory|directories|path|paths|root|roots)\b/.test(normalized);
  const hasSelectedFolderReference = /\b(allowed|approved|selected|chosen)\s+(folder|folders|directory|directories|path|paths|root|roots)\b/.test(normalized);
  const hasInspectVerb = /\b(read|open|inspect|review|analy[sz]e|scan|search|find|list|browse|explore|look through|check|access)\b/.test(normalized);
  const hasContentsIntent = /\b(inside|content|contents|what(?:'| i)?s inside|whats inside|tell me what(?:'| i)?s inside|show me)\b/.test(normalized);
  const hasWriteVerb = /\b(edit|modify|rewrite|refactor|write|create|save|add|implement|build|scaffold|generate|bootstrap|initialize|setup|set up)\b/.test(normalized);
  const hasContinuationCue = /\b(try(?: again| now)?|again|continue|go ahead|do it|proceed|start|resume|now|yes|okay|ok)\b/.test(normalized);
  const hasRelevantAttachment = attachments.some((attachment) => attachment.type === "text" && Boolean(attachment.sourcePath?.trim()));
  const transcript = Array.isArray(conversation?.history)
    ? conversation!.history
      .map((entry) => (entry?.content ?? "").trim())
      .filter(Boolean)
      .join("\n\n")
    : "";
  const normalizedTranscript = transcript.toLowerCase();
  const transcriptSuggestsFilesystemTask = Boolean(normalizedTranscript) && (
    shouldExposeClaudeChatFilesystem(transcript)
    || (
      /\b(can't|cannot|still don't|do not|no)\s+(have|got)\s+(filesystem\s+)?access\b/.test(normalizedTranscript)
      && /([a-z]:\\|\\\\|\/|[a-z0-9._-]+\.[a-z0-9]+)\S*/i.test(transcript)
    )
  );

  if (hasExplicitPathHint) return true;
  if ((hasApprovedFolderReference || hasSelectedFolderReference) && (hasInspectVerb || hasContentsIntent || hasWriteVerb)) return true;
  if (hasInspectVerb && (hasFileTarget || hasProjectTarget)) return true;
  if (hasWriteVerb && (hasFileTarget || hasProjectTarget)) return true;
  if (transcriptSuggestsFilesystemTask && (hasInspectVerb || hasContentsIntent || hasWriteVerb || hasContinuationCue)) return true;
  if (hasRelevantAttachment && (hasInspectVerb || hasWriteVerb)) return true;
  return false;
}

function formatConversationRole(role: string): string {
  if (role === "assistant") return "Assistant";
  if (role === "system") return "System";
  return "User";
}

export function buildClaudeConversationPrompt(
  prompt: string,
  conversation?: ClaudeConversationContext,
  filesystemAccess?: ClaudeChatFilesystemSettings
): string {
  const normalizedPrompt = (prompt ?? "").trim();
  const systemPrompt = (conversation?.systemPrompt ?? "").trim();
  const normalizedHistory = Array.isArray(conversation?.history)
    ? conversation!.history
      .map((entry) => ({
        role: (entry?.role ?? "").trim().toLowerCase(),
        content: (entry?.content ?? "").trim()
      }))
      .filter((entry) => Boolean(entry.content))
    : [];

  let transcriptEntries = normalizedHistory.filter((entry) => entry.role === "user" || entry.role === "assistant");
  const lastTranscriptEntry = transcriptEntries[transcriptEntries.length - 1];
  if (lastTranscriptEntry?.role === "user" && lastTranscriptEntry.content === normalizedPrompt) {
    transcriptEntries = transcriptEntries.slice(0, -1);
  }

  const sections = [
    "You are in Cipher Workspace Claude chat mode.",
    "Do not inspect your current working directory, parent directories, git state, or local files unless the app explicitly grants filesystem access for this turn and the user clearly asks for it.",
    "Do not assume the app's own repo or runtime directory is the user's target project.",
    "Continue the same conversation using the saved chat transcript below.",
    "Stay on the current subject unless the latest user message clearly starts a new topic.",
    "Respond directly to the latest user message. Do not ask what to do next when the latest message is already a follow-up."
  ];

  if (systemPrompt) {
    sections.push("[System prompt]", systemPrompt);
  }

  if (transcriptEntries.length > 0) {
    sections.push(
      "[Conversation transcript]",
      transcriptEntries
        .map((entry) => `${formatConversationRole(entry.role)}:\n${entry.content}`)
        .join("\n\n")
    );
  }

  const normalizedRoots = Array.isArray(filesystemAccess?.roots)
    ? filesystemAccess!.roots.map((root) => root.trim()).filter(Boolean)
    : [];
  const isProjectScaffoldRequest = /\b(create|build|scaffold|generate|bootstrap|set up|setup|initialize)\b/.test(normalizedPrompt.toLowerCase())
    && /\b(project|app|repo|repository|workspace)\b/.test(normalizedPrompt.toLowerCase());
  if (normalizedRoots.length > 0) {
    const singularApprovedReference = normalizedRoots.length === 1
      && /\b(allowed|approved|selected|chosen)\s+(file|files|folder|folders|directory|directories|path|paths|root|roots)\b/i.test(normalizedPrompt);
    sections.push(
      "[Approved Claude chat filesystem access]",
      "You may inspect only these approved folders on the user's PC:",
      ...normalizedRoots.map((root) => `- ${root}`),
      filesystemAccess?.allowWrite === true
        ? "Write access is enabled inside those approved folders. You may scaffold or update a complete project there."
        : "Write access is disabled. You may read, list, and search only.",
      filesystemAccess?.overwritePolicy
        ? `Overwrite policy: ${filesystemAccess.overwritePolicy}.`
        : "Overwrite policy: allow-overwrite.",
      filesystemAccess?.budgets
        ? `Per-turn budgets: max files ${filesystemAccess.budgets.maxFilesPerTurn ?? "default"}, max bytes ${filesystemAccess.budgets.maxBytesPerTurn ?? "default"}, max tool calls ${filesystemAccess.budgets.maxToolCallsPerTurn ?? "default"}.`
        : "Per-turn budgets use the app defaults.",
      "You do not have bash, shell, or terminal access in this chat runtime. Never claim shell sandbox restrictions here. Use only the JSON filesystem tools below.",
      "If earlier transcript messages said filesystem access was unavailable, treat this turn's approved access block as the current source of truth.",
      "These filesystem tool names are an app-level contract for this chat turn. Do not describe them as missing native Claude tools.",
      "Prefer replying with plain JSON text for the next filesystem action. Do not mention Bash, Read, or sandbox fallback tools here.",
      "When you need filesystem access, reply with only strict JSON in one of these exact shapes and nothing else:",
      '{"tool":"list_files","args":{"path":"ABSOLUTE_PATH","depth":2}}',
      '{"tool":"read_file","args":{"path":"ABSOLUTE_PATH"}}',
      '{"tool":"search_files","args":{"path":"ABSOLUTE_PATH","pattern":"text to find"}}',
      '{"tool":"write_plan","args":{"files":[{"path":"ABSOLUTE_PATH","content":"full file content"}]}}',
      '{"tool":"write_file","args":{"path":"ABSOLUTE_PATH","content":"full file content"}}',
      '{"tool":"write_files","args":{"files":[{"path":"ABSOLUTE_PATH","content":"full file content"}]}}',
      '{"tool":"write_binary","args":{"path":"ABSOLUTE_PATH","contentBase64":"BASE64_DATA"}}',
      '{"tool":"write_binaries","args":{"files":[{"path":"ABSOLUTE_PATH","contentBase64":"BASE64_DATA"}]}}',
      '{"tool":"mkdir_path","args":{"path":"ABSOLUTE_PATH"}}',
      '{"tool":"move_path","args":{"fromPath":"ABSOLUTE_PATH","toPath":"ABSOLUTE_PATH"}}',
      '{"tool":"delete_path","args":{"path":"ABSOLUTE_PATH","recursive":true}}',
      "Parent directories are created automatically for write_file and write_files.",
      "Use write_plan before large scaffolds, broad refactors, or destructive operations.",
      "Prefer write_files when creating or updating multiple files for the same project.",
      "Request only one tool per reply.",
      "After the app returns a tool result, continue the same task.",
      "Do not inspect any approved folder or project just because access exists.",
      "If the user has not clearly asked you to inspect, read, search, list, open, or modify files, ask one short clarification question first.",
      "Never assume the app's own workspace is the user's target project."
    );
    if (isProjectScaffoldRequest) {
      sections.push(
        "[Scaffold expectations]",
        "For a full project scaffold, do not stop after creating one file.",
        "Plan the folder tree, create the required app files, and include a README or run instructions when appropriate.",
        "Prefer write_plan first, then use write_files or write_binaries for batched project creation."
      );
    }
    if (singularApprovedReference) {
      sections.push(
        "[Approved folder alias]",
        `In this turn, "the allowed folder", "the approved folder", and "the selected folder" refer to: ${normalizedRoots[0]}`,
        "Use that exact path in your filesystem tool call."
      );
    }
  } else {
    sections.push(
      "[Filesystem access]",
      "No app-approved filesystem access is available for this turn.",
      "If the user wants you to inspect local files or a project folder, ask them to specify the target and enable approved-folder access."
    );
  }

  sections.push("[Latest user message]", normalizedPrompt);
  return sections.join("\n\n").trim();
}

export function sendClaudePrompt(
  claudeSessionManager: Pick<ClaudeSessionManager, "status" | "sendPrompt">,
  prompt: string,
  options?: ClaudeSendOptions
): ReturnType<ClaudeSessionManager["sendPrompt"]> | (ReturnType<ClaudeSessionManager["status"]> & { ok: false; message: string }) {
  const normalizedPrompt = (prompt ?? "").trim();
  const normalizedAttachments = normalizeAttachments(options?.attachments);
  const enabledTools = (options?.enabledTools ?? []).map((tool) => tool.trim()).filter(Boolean);
  const filesystemAccess = shouldExposeClaudeChatFilesystem(normalizedPrompt, normalizedAttachments, options?.conversation)
    ? options?.filesystemAccess
    : undefined;
  if (!normalizedPrompt && normalizedAttachments.length === 0) {
    return { ok: false, message: "Prompt is empty.", ...claudeSessionManager.status() };
  }

  const conversationPrompt = buildClaudeConversationPrompt(
    normalizedPrompt || "Please review the attached files and summarize important points.",
    options?.conversation,
    filesystemAccess
  );

  return claudeSessionManager.sendPrompt(
    conversationPrompt,
    normalizedAttachments,
    enabledTools,
    {
      includeFullTextAttachments: options?.includeFullTextAttachments === true,
      filesystemAccess
    }
  );
}
