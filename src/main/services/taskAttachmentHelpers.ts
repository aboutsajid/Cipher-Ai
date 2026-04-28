import type { AttachmentPayload } from "../../shared/types";
import { buildAttachmentAwarePromptMessages, type ChatHistoryEntry } from "../chatSendSupport";

export function cloneTaskAttachments(attachments: AttachmentPayload[] | undefined): AttachmentPayload[] {
  return (attachments ?? []).map((attachment) => ({ ...attachment }));
}

export function taskRequiresVisionRoute(attachments: AttachmentPayload[]): boolean {
  return attachments.some((attachment) => attachment.type === "image");
}

export function buildTaskPromptMessages(
  prompt: string,
  attachments: AttachmentPayload[],
  systemPreamble: string
): ChatHistoryEntry[] {
  return [
    { role: "system", content: systemPreamble },
    ...buildAttachmentAwarePromptMessages(prompt, attachments)
  ];
}
