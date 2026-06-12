import { Worker, type ConnectionOptions } from 'bullmq';
import { eq } from 'drizzle-orm';
import {
  type Db, conversations, extractionResults, campaigns,
  pharmacies, products, campaignProducts, campaignReports,
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

        extractions.push({
          pharmacyName: pharmacy?.name ?? 'Unknown',
          result: parsed.data,
        });
      }

      if (extractions.length === 0) {
        console.warn(`[ANALYZE] No extractions found for campaign ${campaignId}`);
        return;
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
