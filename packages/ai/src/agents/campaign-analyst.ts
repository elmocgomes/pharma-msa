import type { LlmProvider, LlmMessage } from '../providers/types.js';
import { CampaignReportSchema, type CampaignReport, type EnrichedExtractorResult } from '@pharma/shared';
import { CAMPAIGN_ANALYST_SYSTEM_PROMPT } from '../prompts/campaign-analyst.js';

const CAMPAIGN_ANALYST_TOOL = {
  name: 'generate_report',
  description: 'Gera relatório de inteligência de mercado da campanha',
  inputSchema: {
    type: 'object' as const,
    properties: {
      reference_product: { type: 'string' },
      total_pharmacies_contacted: { type: 'number' },
      total_pharmacies_responded: { type: 'number' },
      summary: {
        type: 'object' as const,
        properties: {
          reference_availability_rate: { type: 'number' },
          reference_avg_price: { type: 'number' },
          reference_price_range: {
            type: 'object' as const,
            properties: { min: { type: 'number' }, max: { type: 'number' } },
          },
          similares_found: {
            type: 'array' as const,
            items: {
              type: 'object' as const,
              properties: {
                name: { type: 'string' },
                laboratory: { type: 'string' },
                availability_rate: { type: 'number' },
                avg_price: { type: 'number' },
                pharmacies_offering: { type: 'number' },
              },
              required: ['name', 'availability_rate', 'pharmacies_offering'],
            },
          },
          generics_found: {
            type: 'array' as const,
            items: {
              type: 'object' as const,
              properties: {
                name: { type: 'string' },
                laboratory: { type: 'string' },
                availability_rate: { type: 'number' },
                avg_price: { type: 'number' },
                pharmacies_offering: { type: 'number' },
              },
              required: ['name', 'availability_rate', 'pharmacies_offering'],
            },
          },
          prescription_required_rate: { type: 'number' },
          delivery_offered_rate: { type: 'number' },
          avg_conversation_quality: { type: 'string' },
          avg_pharmacy_responsiveness: { type: 'string' },
        },
        required: ['reference_availability_rate', 'similares_found', 'generics_found'],
      },
      insights: { type: 'array' as const, items: { type: 'string' } },
      recommendations: { type: 'array' as const, items: { type: 'string' } },
    },
    required: ['reference_product', 'total_pharmacies_contacted', 'total_pharmacies_responded', 'summary', 'insights', 'recommendations'],
  },
};

export class CampaignAnalystAgent {
  constructor(private provider: LlmProvider) {}

  async analyze(opts: {
    campaignId: string;
    referenceProduct: {
      name: string;
      activeIngredient?: string;
      dosage?: string;
      brand?: string;
    };
    extractions: {
      pharmacyName: string;
      result: EnrichedExtractorResult;
    }[];
  }): Promise<CampaignReport> {
    const dataSummary = opts.extractions.map((e, i) => {
      const findings = e.result.findings.map((f) =>
        `  - ${f.product_name_mentioned} (${f.product_type}): ${f.is_available ? 'disponível' : 'indisponível'}${f.price ? `, R$ ${f.price.toFixed(2)}` : ''}${f.laboratory ? `, lab: ${f.laboratory}` : ''}`
      ).join('\n');
      return `Farmácia ${i + 1} (${e.pharmacyName}):
  Qualidade: ${e.result.conversation_quality}, Cooperação: ${e.result.pharmacy_responsiveness}
  Pediu receita: ${e.result.pharmacy_asked_for_prescription ? 'sim' : 'não'}
  Ofereceu entrega: ${e.result.pharmacy_offered_delivery ? 'sim' : 'não'}
  Produtos:
${findings}`;
    }).join('\n\n');

    const messages: LlmMessage[] = [{
      role: 'user',
      content: `PRODUTO DE REFERÊNCIA: ${opts.referenceProduct.name}
Princípio ativo: ${opts.referenceProduct.activeIngredient ?? 'N/A'}
Dosagem: ${opts.referenceProduct.dosage ?? 'N/A'}
Laboratório: ${opts.referenceProduct.brand ?? 'N/A'}

TOTAL DE FARMÁCIAS: ${opts.extractions.length}

DADOS DAS CONVERSAS:
${dataSummary}

Analise os dados e produza o relatório de mercado.`,
    }];

    const response = await this.provider.chat({
      system: CAMPAIGN_ANALYST_SYSTEM_PROMPT,
      messages,
      tools: [CAMPAIGN_ANALYST_TOOL],
      toolChoice: { type: 'tool', name: CAMPAIGN_ANALYST_TOOL.name },
      temperature: 0.2,
      maxTokens: 4096,
    });

    const toolCall = response.toolCalls[0];
    if (!toolCall) throw new Error('CampaignAnalyst returned no tool call');

    const raw = toolCall.input as Record<string, unknown>;
    raw.campaign_id = opts.campaignId;
    raw.generated_at = new Date().toISOString();

    const parsed = CampaignReportSchema.safeParse(raw);
    if (!parsed.success) throw new Error(`CampaignAnalyst validation failed: ${parsed.error.message}`);

    return parsed.data;
  }
}
