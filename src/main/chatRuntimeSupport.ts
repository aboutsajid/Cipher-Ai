import type { Message, Settings } from "../shared/types";
import type { ChatHistoryEntry } from "./chatSendSupport";

export interface ChatRuntimeRouteOptions {
  baseUrl?: string;
  cloudProvider?: "openrouter" | "nvidia";
  apiKey?: string;
  skipAuth?: boolean;
}

interface StreamAssistantResponsesArgs {
  assistantMessages: Message[];
  history: ChatHistoryEntry[];
  chatId: string;
  fallbackModel: string;
  routeOptions?: ChatRuntimeRouteOptions;
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
    routeOptions,
    signal,
    getSettings,
    sendMessage,
    updateMessage,
    emit
  } = args;

  await Promise.all(assistantMessages.map(async (assistantMessage) => {
    const selectedModel = assistantMessage.model ?? fallbackModel;
    const appSettings = getSettings();
    const useOllama = routeOptions
      ? routeOptions.skipAuth === true
      : appSettings.ollamaEnabled && selectedModel.startsWith("ollama/");
    const targetModel = useOllama && selectedModel.startsWith("ollama/")
      ? selectedModel.slice("ollama/".length)
      : selectedModel;
    const resolvedRouteOptions: ChatRuntimeRouteOptions = {
      baseUrl: routeOptions?.baseUrl ?? (useOllama ? appSettings.ollamaBaseUrl : appSettings.baseUrl),
      cloudProvider: routeOptions?.cloudProvider ?? (useOllama ? undefined : appSettings.cloudProvider),
      apiKey: routeOptions?.apiKey ?? (useOllama ? "" : appSettings.apiKey),
      skipAuth: routeOptions?.skipAuth ?? useOllama
    };

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
        resolvedRouteOptions
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
