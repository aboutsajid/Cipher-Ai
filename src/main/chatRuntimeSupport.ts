import type { Message, Settings } from "../shared/types";
import type { ChatHistoryEntry } from "./chatSendSupport";

export interface ChatRuntimeRouteOptions {
  baseUrl?: string;
  apiKey?: string;
  skipAuth?: boolean;
}

interface StreamAssistantResponsesArgs {
  assistantMessages: Message[];
  history: ChatHistoryEntry[];
  chatId: string;
  fallbackModel: string;
  signal: AbortSignal;
  getSettings: () => Settings;
  sendMessage: (
    history: ChatHistoryEntry[],
    model: string,
    onChunk: (chunk: string) => Promise<void>,
    signal: AbortSignal,
    options: ChatRuntimeRouteOptions
  ) => Promise<unknown>;
  updateMessage: (chatId: string, messageId: string, patch: Partial<Message>) => Promise<void>;
  emit: (channel: "chat:chunk" | "chat:done" | "chat:error", chatId: string, messageId: string, payload?: string) => void;
}

export async function streamAssistantResponses(args: StreamAssistantResponsesArgs): Promise<void> {
  const {
    assistantMessages,
    history,
    chatId,
    fallbackModel,
    signal,
    getSettings,
    sendMessage,
    updateMessage,
    emit
  } = args;

  await Promise.all(assistantMessages.map(async (assistantMessage) => {
    const selectedModel = assistantMessage.model ?? fallbackModel;
    const appSettings = getSettings();
    const useOllama = appSettings.ollamaEnabled && selectedModel.startsWith("ollama/");
    const targetModel = useOllama ? selectedModel.slice("ollama/".length) : selectedModel;

    try {
      await sendMessage(
        history,
        targetModel,
        async (chunk) => {
          assistantMessage.content += chunk;
          emit("chat:chunk", chatId, assistantMessage.id, chunk);
          await updateMessage(chatId, assistantMessage.id, { content: assistantMessage.content });
        },
        signal,
        {
          baseUrl: useOllama ? appSettings.ollamaBaseUrl : appSettings.baseUrl,
          apiKey: useOllama ? "" : appSettings.apiKey,
          skipAuth: useOllama
        }
      );
      emit("chat:done", chatId, assistantMessage.id);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      assistantMessage.error = errorMessage;
      await updateMessage(chatId, assistantMessage.id, {
        error: errorMessage,
        content: assistantMessage.content || errorMessage
      });
      emit("chat:error", chatId, assistantMessage.id, errorMessage);
    }
  }));
}
