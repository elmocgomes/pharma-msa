import type { LlmProvider, LlmMessage } from '../providers/types.js';
import { RecoveryResultSchema, type RecoveryResult } from '@pharma/shared';
import { buildRecoverySystemPrompt, buildRecoveryMessages, RECOVERY_TOOL } from '../prompts/recovery.js';

export class RecoveryAgent {
  constructor(private provider: LlmProvider) {}

  async recover(opts: {
    pharmacyMessage: string;
    conversationHistory: LlmMessage[];
    currentIntent: string;
    persona: {
      name: string;
      cpf?: string;
      details?: Record<string, unknown>;
    };
  }): Promise<RecoveryResult> {
    const systemPrompt = buildRecoverySystemPrompt(opts.persona);
    const messages = buildRecoveryMessages(
      opts.pharmacyMessage,
      opts.conversationHistory,
      opts.currentIntent,
    );

    const response = await this.provider.chat({
      system: systemPrompt,
      messages,
      tools: [RECOVERY_TOOL],
      toolChoice: { type: 'tool', name: RECOVERY_TOOL.name },
      temperature: 0.3,
      maxTokens: 256,
    });

    const toolCall = response.toolCalls[0];
    if (!toolCall) {
      throw new Error('Recovery agent returned no tool call');
    }

    const parsed = RecoveryResultSchema.safeParse(toolCall.input);
    if (!parsed.success) {
      throw new Error(`Recovery output validation failed: ${parsed.error.message}`);
    }

    return parsed.data;
  }
}
