export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmToolProperty {
  type: string;
  description?: string;
  enum?: string[];
  items?: LlmToolProperty;
  default?: unknown;
}

export interface LlmToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, LlmToolProperty>;
    required?: string[];
  };
}

export interface LlmToolCall {
  name: string;
  input: Record<string, unknown>;
}

export interface LlmResponse {
  text: string | null;
  toolCalls: LlmToolCall[];
  usage: { inputTokens: number; outputTokens: number };
}

export interface LlmChatOptions {
  system: string;
  messages: LlmMessage[];
  tools?: LlmToolDefinition[];
  toolChoice?: { type: 'tool'; name: string };
  maxTokens?: number;
  temperature?: number;
}

export interface LlmProvider {
  chat(opts: LlmChatOptions): Promise<LlmResponse>;
}

export interface LlmProviderConfig {
  provider: 'anthropic' | 'openai';
  model: string;
  apiKey: string;
}
