import { Worker, type ConnectionOptions } from 'bullmq';
import { eq } from 'drizzle-orm';
import {
  type Db, conversations, extractionResults, productFindings,
  getConversationMessages, campaignProducts, products,
} from '@pharma/db';
import { ExtractorAgent, type LlmProvider, type LlmMessage } from '@pharma/ai';
import { transition } from '../engine/state-machine.js';
import type { ExtractJobData } from '../queues/definitions.js';

export function createExtractWorker(
  db: Db,
  extractorProvider: LlmProvider,
  redis: ConnectionOptions,
) {
  const extractor = new ExtractorAgent(extractorProvider);

  return new Worker<ExtractJobData>(
    'extract',
    async (job) => {
      const { conversationId, traceId } = job.data;

      const [conv] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
      if (!conv || conv.status !== 'extracting') return;

      try {
        const msgs = await getConversationMessages(db, conversationId);
        const transcript: LlmMessage[] = msgs.map((m) => ({
          role: m.direction === 'outbound' ? 'assistant' as const : 'user' as const,
          content: m.content,
        }));

        const productList = await db
          .select({ product: products })
          .from(campaignProducts)
          .innerJoin(products, eq(campaignProducts.productId, products.id))
          .where(eq(campaignProducts.campaignId, conv.campaignId));

        const productNames = productList.map((p) => p.product.name);

        const result = await extractor.extract({ conversationTranscript: transcript, productNames });

        const [extraction] = await db.insert(extractionResults).values({
          conversationId,
          rawAnalysis: result,
        }).returning();

        if (extraction) {
          for (const finding of result.products) {
            const matchedProduct = productList.find((p) =>
              p.product.name.toLowerCase() === finding.product_name.toLowerCase()
            );

            await db.insert(productFindings).values({
              extractionResultId: extraction.id,
              productId: matchedProduct?.product.id,
              productNameMentioned: finding.product_name,
              isAvailable: finding.is_available,
              price: finding.price?.toString(),
              priceUnit: finding.price_currency,
              hasGeneric: finding.has_generic,
              genericNames: finding.generic_names,
              genericPrices: finding.generic_prices.map(String),
              alternativeNames: finding.alternative_names,
              notes: finding.notes,
            });
          }
        }

        await transition(db, {
          conversationId,
          expectedVersion: conv.version,
          newStatus: 'completed',
          traceId,
          eventData: {
            productsExtracted: result.products.length,
            quality: result.conversation_quality,
          },
        });

        console.log(`[EXTRACT] Completed extraction for ${conversationId}: ${result.products.length} products`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[EXTRACT] Error for ${conversationId}:`, message);

        const [latest] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
        if (latest) {
          await transition(db, {
            conversationId,
            expectedVersion: latest.version,
            newStatus: 'error',
            traceId,
            updates: { errorReason: `Extraction failed: ${message}` },
          });
        }
      }
    },
    { connection: redis, concurrency: 3 },
  );
}
