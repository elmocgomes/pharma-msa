import OpenAI from 'openai';
import type { LlmProvider, LlmChatOptions, LlmResponse, LlmToolDefinition } from './types.js';

function toOpenAiTool(tool: LlmToolDefinition): OpenAI.ChatCompletionTool {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties: tool.inputSchema.properties,
        required: tool.inputSchema.required,
      },
    },
  };
}

export class OpenAIProvider implements LlmProvider {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async chat(opts: LlmChatOptions): Promise<LlmResponse> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: opts.system },
      ...opts.messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? 0,
      messages,
      tools: opts.tools?.map(toOpenAiTool),
      tool_choice: opts.toolChoice
        ? { type: 'function' as const, function: { name: opts.toolChoice.name } }
        : undefined,
    });

    const choice = response.choices[0];
    const text = choice?.message?.content ?? null;

    const toolCalls = (choice?.message?.tool_calls ?? []).map((tc) => ({
      name: tc.function.name,
      input: JSON.parse(tc.function.arguments) as Record<string, unknown>,
    }));

    return {
      text,
      toolCalls,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
    };
  }
}
