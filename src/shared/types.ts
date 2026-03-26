export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  model?: string;
  error?: string;
  metadata?: {
    attachmentNames?: string[];
    compareGroup?: string;
    compareSlot?: "A" | "B";
  };
}

export interface Chat {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
  systemPrompt?: string;
}

export interface ChatSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface Settings {
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  routerPort: number;
  models: string[];
  customTemplates: PromptTemplate[];
  ollamaEnabled: boolean;
  ollamaBaseUrl: string;
  ollamaModels: string[];
  mcpServers: McpServerConfig[];
  routing: {
    default: string;
    think: string;
    longContext: string;
  };
}

export interface PromptTemplate {
  name: string;
  content: string;
}

export interface McpServerConfig {
  name: string;
  command: string;
  args: string[];
}

export interface AttachmentPayload {
  name: string;
  type: "text" | "image";
  content: string;
  mimeType?: string;
}

export interface RouterStatus {
  running: boolean;
  pid?: number;
  port: number;
}

export type IpcChannel =
  | "chat:list"
  | "chat:get"
  | "chat:create"
  | "chat:delete"
  | "chat:rename"
  | "chat:export"
  | "chat:setSystemPrompt"
  | "chat:summarize"
  | "chat:generateTitle"
  | "chat:transcribeAudio"
  | "chat:send"
  | "chat:stop"
  | "stats:get"
  | "settings:get"
  | "settings:save"
  | "attachments:pick"
  | "templates:list"
  | "templates:save"
  | "templates:delete"
  | "ollama:listModels"
  | "mcp:list"
  | "mcp:add"
  | "mcp:remove"
  | "mcp:start"
  | "mcp:stop"
  | "mcp:status"
  | "router:status"
  | "router:logs"
  | "router:start"
  | "router:stop"
  | "router:test";
