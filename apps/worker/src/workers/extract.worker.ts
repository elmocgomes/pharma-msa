import { Worker, type ConnectionOptions } from 'bullmq';
import { eq, ilike, or } from 'drizzle-orm';
import {
  type Db, conversations, extractionResults, productFindings,
  getConversationMessages, campaignProducts, products,
  pharmacies, anvisaProducts, type PmcByIcms,
} from '@pharma/db';
import { ExtractorAgent, type LlmProvider, type LlmMessage } from '@pharma/ai';
import { getPmcForState } from '@pharma/shared';
import { transition } from '../engine/state-machine.js';
import type { ExtractJobData } from '../queues/definitions.js';

/**
 * Look up the PMC (max consumer price) for a product name/substance in a given state.
 * Searches Anvisa products by exact product name or active ingredient match.
 * Returns the lowest PMC among matches (most conservative comparison).
 */
async function lookupPmc(
  db: Db,
  productName: string,
  activeIngredient: string | null,
  pharmacyState: string,
): Promise<{ pmcValue: number; anvisaMatch: string } | null> {
  // Try exact product name match first, then substance match
  const searchTerms = [productName];
  if (activeIngredient) searchTerms.push(activeIngredient);

  const conditions = searchTerms.map((term) =>
    or(
      ilike(anvisaProducts.produto, `%${term}%`),
      ilike(anvisaProducts.substancia, `%${term}%`),
    )
  );

  const matches = await db
    .select({
      produto: anvisaProducts.produto,
      substancia: anvisaProducts.substancia,
      pmcByIcms: anvisaProducts.pmcByIcms,
    })
    .from(anvisaProducts)
    .where(or(...conditions))
    .limit(20);

  if (matches.length === 0) return null;

  // Find the best PMC: use the one closest to the product name
  let bestPmc: number | null = null;
  let bestMatch = '';

  for (const m of matches) {
    const pmc = getPmcForState(m.pmcByIcms as PmcByIcms, pharmacyState);
    if (pmc == null) continue;

    // Prefer exact product name match over substance match
    const isExactProduct = m.produto.toLowerCase().includes(productName.toLowerCase());
    const currentIsExact = bestMatch && matches.find((x) => x.produto === bestMatch)
      ?.produto.toLowerCase().includes(productName.toLowerCase());

    if (bestPmc == null || (isExactProduct && !currentIsExact) || pmc < bestPmc) {
      bestPmc = pmc;
      bestMatch = m.produto;
    }
  }

  if (bestPmc == null) return null;
  return { pmcValue: bestPmc, anvisaMatch: bestMatch };
}

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

        // Look up the pharmacy's state for PMC validation
        const [pharmacy] = await db
          .select({ state: pharmacies.state })
          .from(pharmacies)
          .where(eq(pharmacies.id, conv.pharmacyId));

        const pharmacyState = pharmacy?.state?.toUpperCase() ?? null;

        const [extraction] = await db.insert(extractionResults).values({
          conversationId,
          rawAnalysis: result,
        }).returning();

        let pmcExceededCount = 0;

        if (extraction) {
          for (const finding of result.products) {
            const matchedProduct = productList.find((p) =>
              p.product.name.toLowerCase() === finding.product_name.toLowerCase()
            );

            // PMC validation: check if extracted price exceeds legal maximum
            let pmcValue: string | undefined;
            let pmcExceeded: boolean | undefined;

            if (finding.price != null && pharmacyState) {
              const pmcResult = await lookupPmc(
                db,
                finding.product_name,
                matchedProduct?.product.activeIngredient ?? null,
                pharmacyState,
              );

              if (pmcResult) {
                pmcValue = pmcResult.pmcValue.toFixed(2);
                pmcExceeded = finding.price > pmcResult.pmcValue;
                if (pmcExceeded) {
                  pmcExceededCount++;
                  console.log(
                    `[EXTRACT] PMC exceeded for "${finding.product_name}": ` +
                    `pharmacy price R$${finding.price.toFixed(2)} > PMC R$${pmcResult.pmcValue.toFixed(2)} ` +
                    `(${pharmacyState}, matched: "${pmcResult.anvisaMatch}")`
                  );
                }
              }
            }

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
              pmcValue,
              pmcExceeded,
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
            pmcExceededCount,
          },
        });

        console.log(
          `[EXTRACT] Completed extraction for ${conversationId}: ` +
          `${result.products.length} products, ${pmcExceededCount} PMC violations`
        );
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
