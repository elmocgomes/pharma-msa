import { Worker, Queue, type ConnectionOptions } from 'bullmq';
import { eq, and } from 'drizzle-orm';
import {
  type Db, campaigns, campaignPharmacies, campaignProducts, products,
  conversations, pharmacies,
} from '@pharma/db';
import { formatProductForInquiry } from '@pharma/shared';
import type { CampaignJobData } from '../queues/definitions.js';

export function createCampaignWorker(db: Db, redis: ConnectionOptions) {
  const conversationQueue = new Queue('conversation', { connection: redis });

  return new Worker<CampaignJobData>(
    'campaign',
    async (job) => {
      const { campaignId, traceId } = job.data;
      console.log(`[CAMPAIGN] Spawning conversations for campaign ${campaignId}`);

      const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
      if (!campaign || campaign.status !== 'running') {
        console.log(`[CAMPAIGN] Campaign ${campaignId} not running, skipping`);
        return;
      }

      const pendingPharmacies = await db
        .select({ cp: campaignPharmacies, pharmacy: pharmacies })
        .from(campaignPharmacies)
        .innerJoin(pharmacies, eq(campaignPharmacies.pharmacyId, pharmacies.id))
        .where(
          and(
            eq(campaignPharmacies.campaignId, campaignId),
            eq(campaignPharmacies.status, 'pending'),
          ),
        );

      const surveyProducts = await db
        .select({ product: products })
        .from(campaignProducts)
        .innerJoin(products, eq(campaignProducts.productId, products.id))
        .where(and(eq(campaignProducts.campaignId, campaignId), eq(campaignProducts.role, 'survey')));

      if (surveyProducts.length === 0) {
        console.warn(`[CAMPAIGN] No survey products in campaign ${campaignId}`);
        return;
      }

      const competitorProducts = await db
        .select({ product: products })
        .from(campaignProducts)
        .innerJoin(products, eq(campaignProducts.productId, products.id))
        .where(and(eq(campaignProducts.campaignId, campaignId), eq(campaignProducts.role, 'competitor')));

      const firstProduct = surveyProducts[0]!.product;
      const settings = campaign.settings as { delay_range_ms: [number, number]; concurrent_limit: number };
      const [minDelay, maxDelay] = settings.delay_range_ms;
      let spawned = 0;

      for (const { cp, pharmacy } of pendingPharmacies) {
        if (spawned >= settings.concurrent_limit) break;

        const competitorNames = competitorProducts
          .map((cp) => formatProductForInquiry(cp.product))
          .join(', ');

        const variables: Record<string, string> = {
          product_name: formatProductForInquiry(firstProduct),
          active_ingredient: firstProduct.activeIngredient ?? '',
          brand: firstProduct.brand ?? '',
          dosage: firstProduct.dosage ?? '',
          competitors: competitorNames,
        };

        const [conv] = await db.insert(conversations).values({
          campaignId,
          pharmacyId: pharmacy.id,
          waSessionId: campaign.waSessionId,
          scriptId: campaign.scriptId,
          variables,
          productIndex: 0,
        }).returning();

        await db
          .update(campaignPharmacies)
          .set({ status: 'in_progress' })
          .where(eq(campaignPharmacies.id, cp.id));

        const delay = minDelay + Math.random() * (maxDelay - minDelay);

        await conversationQueue.add('start', {
          conversationId: conv!.id,
          traceId,
        }, { delay: Math.round(delay) });

        spawned++;
      }

      console.log(`[CAMPAIGN] Spawned ${spawned} conversations for campaign ${campaignId}`);
    },
    { connection: redis, concurrency: 2 },
  );
}
