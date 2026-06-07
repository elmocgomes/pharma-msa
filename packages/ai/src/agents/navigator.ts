import type { LlmProvider, LlmMessage } from '../providers/types.js';
import { NavigatorResultSchema, type NavigatorResult } from '@pharma/shared';
import { NAVIGATOR_SYSTEM_PROMPT, buildNavigatorMessages, buildNavigatorTool } from '../prompts/navigator.js';

export class NavigatorAgent {
  constructor(private provider: LlmProvider) {}

  async classify(opts: {
    pharmacyMessage: string;
    conversationHistory: LlmMessage[];
    intent: string;
    branches: { category: string; description: string }[];
  }): Promise<NavigatorResult> {
    const validCategories = opts.branches.map((b) => b.category);
    const tool = buildNavigatorTool(validCategories);
    const messages = buildNavigatorMessages(
      opts.pharmacyMessage,
      opts.conversationHistory,
      opts.intent,
      opts.branches,
    );

    const response = await this.provider.chat({
      system: NAVIGATOR_SYSTEM_PROMPT,
      messages,
      tools: [tool],
      toolChoice: { type: 'tool', name: tool.name },
      temperature: 0,
      maxTokens: 256,
    });

    const toolCall = response.toolCalls[0];
    if (!toolCall) {
      throw new Error('Navigator agent returned no tool call');
    }

    const parsed = NavigatorResultSchema.safeParse(toolCall.input);
    if (!parsed.success) {
      throw new Error(`Navigator output validation failed: ${parsed.error.message}`);
    }

    return parsed.data;
  }
}
