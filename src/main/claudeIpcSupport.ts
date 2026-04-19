import { normalizeAttachments } from "./attachmentSupport";
import type { AttachmentPayload } from "../shared/types";
import type { ClaudeSessionManager } from "./claudeSupport";

interface ClaudeSendOptions {
  attachments?: AttachmentPayload[];
  enabledTools?: string[];
  includeFullTextAttachments?: boolean;
}

export function sendClaudePrompt(
  claudeSessionManager: Pick<ClaudeSessionManager, "status" | "sendPrompt">,
  prompt: string,
  options?: ClaudeSendOptions
): ReturnType<ClaudeSessionManager["sendPrompt"]> | (ReturnType<ClaudeSessionManager["status"]> & { ok: false; message: string }) {
  const normalizedPrompt = (prompt ?? "").trim();
  const normalizedAttachments = normalizeAttachments(options?.attachments);
  const enabledTools = (options?.enabledTools ?? []).map((tool) => tool.trim()).filter(Boolean);
  if (!normalizedPrompt && normalizedAttachments.length === 0) {
    return { ok: false, message: "Prompt is empty.", ...claudeSessionManager.status() };
  }

  return claudeSessionManager.sendPrompt(
    normalizedPrompt || "Please review the attached files and summarize important points.",
    normalizedAttachments,
    enabledTools,
    { includeFullTextAttachments: options?.includeFullTextAttachments === true }
  );
}
