import type { LlmProvider, LlmMessage } from '../providers/types.js';
import { ProductIdentificationSchema, type ProductIdentification } from '@pharma/shared';
import {
  PRODUCT_IDENTIFIER_SYSTEM_PROMPT,
  buildProductIdentifierMessages,
  PRODUCT_IDENTIFIER_TOOL,
} from '../prompts/product-identifier.js';

export class ProductIdentifierAgent {
  constructor(private provider: LlmProvider) {}

  async identify(opts: {
    pharmacyMessage: string;
    conversationHistory: LlmMessage[];
    referenceProduct: {
      name: string;
      activeIngredient?: string;
      dosage?: string;
      brand?: string;
    };
    knownCompetitors?: { name: string; productType: string; laboratory?: string }[];
  }): Promise<ProductIdentification> {
    const messages = buildProductIdentifierMessages(
      opts.pharmacyMessage,
      opts.conversationHistory,
      opts.referenceProduct,
      opts.knownCompetitors,
    );

    const response = await this.provider.chat({
      system: PRODUCT_IDENTIFIER_SYSTEM_PROMPT,
      messages,
      tools: [PRODUCT_IDENTIFIER_TOOL],
      toolChoice: { type: 'tool', name: PRODUCT_IDENTIFIER_TOOL.name },
      temperature: 0,
      maxTokens: 1024,
    });

    const toolCall = response.toolCalls[0];
    if (!toolCall) throw new Error('ProductIdentifier returned no tool call');

    const parsed = ProductIdentificationSchema.safeParse(toolCall.input);
    if (!parsed.success) throw new Error(`ProductIdentifier validation failed: ${parsed.error.message}`);

    return parsed.data;
  }
}
