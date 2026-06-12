import { Worker, type ConnectionOptions } from 'bullmq';
import { eq } from 'drizzle-orm';
import {
  type Db, conversations, extractionResults, campaigns,
  pharmacies, products, campaignProducts, campaignReports,
  productFindings,
} from '@pharma/db';
import { EnrichedExtractorResultSchema } from '@pharma/shared';
import { CampaignAnalystAgent, type LlmProvider } from '@pharma/ai';
import type { AnalyzeJobData } from '../queues/definitions.js';
import { QUEUE_NAMES } from '../queues/definitions.js';

export function createAnalyzeWorker(
  db: Db,
  analystProvider: LlmProvider,
  redis: ConnectionOptions,
) {
  const analyst = new CampaignAnalystAgent(analystProvider);

  return new Worker<AnalyzeJobData>(
    QUEUE_NAMES.analyze,
    async (job) => {
      const { campaignId, traceId } = job.data;
      console.log(`[ANALYZE] Starting campaign analysis for ${campaignId} (trace: ${traceId})`);

      // Load campaign + reference product
      const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
      if (!campaign) {
        console.error(`[ANALYZE] Campaign ${campaignId} not found`);
        return;
      }

      const campaignProductList = await db
        .select({ product: products })
        .from(campaignProducts)
        .innerJoin(products, eq(campaignProducts.productId, products.id))
        .where(eq(campaignProducts.campaignId, campaignId));

      const referenceProduct = campaignProductList[0]?.product;
      if (!referenceProduct) {
        console.error(`[ANALYZE] No products found for campaign ${campaignId}`);
        return;
      }

      // Load all completed conversations + extraction results
      const completedConversations = await db
        .select({
          conversationId: conversations.id,
          pharmacyId: conversations.pharmacyId,
        })
        .from(conversations)
        .where(eq(conversations.campaignId, campaignId));

      const extractions: { pharmacyName: string; result: any }[] = [];
      const pmcViolations: { pharmacyName: string; productName: string; price: number; pmcValue: number }[] = [];

      for (const conv of completedConversations) {
        const [extraction] = await db
          .select()
          .from(extractionResults)
          .where(eq(extractionResults.conversationId, conv.conversationId));

        if (!extraction?.rawAnalysis) continue;

        const parsed = EnrichedExtractorResultSchema.safeParse(extraction.rawAnalysis);
        if (!parsed.success) continue;

        const [pharmacy] = await db
          .select()
          .from(pharmacies)
          .where(eq(pharmacies.id, conv.pharmacyId));

        const pharmacyName = pharmacy?.name ?? 'Unknown';

        extractions.push({
          pharmacyName,
          result: parsed.data,
        });

        // Collect PMC violations from product_findings
        const findings = await db
          .select()
          .from(productFindings)
          .where(eq(productFindings.extractionResultId, extraction.id));

        for (const f of findings) {
          if (f.pmcExceeded && f.price && f.pmcValue) {
            pmcViolations.push({
              pharmacyName,
              productName: f.productNameMentioned,
              price: parseFloat(f.price),
              pmcValue: parseFloat(f.pmcValue),
            });
          }
        }
      }

      if (extractions.length === 0) {
        console.warn(`[ANALYZE] No extractions found for campaign ${campaignId}`);
        return;
      }

      // Build PMC compliance context for the analyst
      let pmcContext = '';
      if (pmcViolations.length > 0) {
        pmcContext = '\n\n## PMC Compliance Issues\n' +
          `${pmcViolations.length} product price(s) exceeded the legal maximum (PMC/CMED):\n` +
          pmcViolations.map((v) =>
            `- ${v.pharmacyName}: "${v.productName}" at R$${v.price.toFixed(2)} (PMC limit: R$${v.pmcValue.toFixed(2)}, excess: +${((v.price / v.pmcValue - 1) * 100).toFixed(1)}%)`
          ).join('\n');
      }

      try {
        const report = await analyst.analyze({
          campaignId,
          referenceProduct: {
            name: referenceProduct.name,
            activeIngredient: referenceProduct.activeIngredient ?? undefined,
            dosage: referenceProduct.dosage ?? undefined,
            brand: referenceProduct.brand ?? undefined,
          },
          extractions,
          additionalContext: pmcContext || undefined,
        });

        await db.insert(campaignReports).values({
          campaignId,
          report,
        });

        console.log(`[ANALYZE] Campaign ${campaignId} report generated successfully`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[ANALYZE] Failed to generate report for ${campaignId}:`, message);
      }
    },
    { connection: redis, concurrency: 2 },
  );
}
