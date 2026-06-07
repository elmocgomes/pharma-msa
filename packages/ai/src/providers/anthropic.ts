import Anthropic from '@anthropic-ai/sdk';
import type { LlmProvider, LlmChatOptions, LlmResponse, LlmToolDefinition } from './types.js';

function toAnthropicTool(tool: LlmToolDefinition): Anthropic.Tool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: 'object' as const,
      properties: tool.inputSchema.properties as Record<string, unknown>,
      required: tool.inputSchema.required,
    },
  };
}

export class AnthropicProvider implements LlmProvider {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async chat(opts: LlmChatOptions): Promise<LlmResponse> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? 0,
      system: opts.system,
      messages: opts.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      tools: opts.tools?.map(toAnthropicTool),
      tool_choice: opts.toolChoice
        ? { type: 'tool' as const, name: opts.toolChoice.name }
        : undefined,
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('') || null;

    const toolCalls = response.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      .map((b) => ({ name: b.name, input: b.input as Record<string, unknown> }));

    return {
      text,
      toolCalls,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}
