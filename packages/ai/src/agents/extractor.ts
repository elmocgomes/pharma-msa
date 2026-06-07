import type { LlmProvider, LlmMessage } from '../providers/types.js';
import { ExtractorResultSchema, type ExtractorResult } from '@pharma/shared';
import { EXTRACTOR_SYSTEM_PROMPT, buildExtractorMessages, EXTRACTOR_TOOL } from '../prompts/extractor.js';

export class ExtractorAgent {
  constructor(private provider: LlmProvider) {}

  async extract(opts: {
    conversationTranscript: LlmMessage[];
    productNames: string[];
  }): Promise<ExtractorResult> {
    const messages = buildExtractorMessages(
      opts.conversationTranscript,
      opts.productNames,
    );

    const response = await this.provider.chat({
      system: EXTRACTOR_SYSTEM_PROMPT,
      messages,
      tools: [EXTRACTOR_TOOL],
      toolChoice: { type: 'tool', name: EXTRACTOR_TOOL.name },
      temperature: 0,
      maxTokens: 4096,
    });

    const toolCall = response.toolCalls[0];
    if (!toolCall) {
      throw new Error('Extractor agent returned no tool call');
    }

    const parsed = ExtractorResultSchema.safeParse(toolCall.input);
    if (!parsed.success) {
      throw new Error(`Extractor output validation failed: ${parsed.error.message}`);
    }

    return parsed.data;
  }
}
