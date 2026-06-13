import { Hono } from 'hono';
import { eq, inArray } from 'drizzle-orm';
import { Queue, type ConnectionOptions } from 'bullmq';
import {
  campaigns, campaignPharmacies, campaignProducts, products, anvisaProducts,
  conversations, messages, conversationEvents, extractionResults, productFindings,
  campaignReports, type Db,
} from '@pharma/db';
import { CampaignSettingsSchema } from '@pharma/shared';

export function createCampaignRoutes(db: Db, redis: ConnectionOptions) {
  const app = new Hono();
  const campaignQueue = new Queue('campaign', { connection: redis });

  app.get('/', async (c) => {
    const result = await db.select().from(campaigns);
    return c.json(result);
  });

  app.get('/:id', async (c) => {
    const id = c.req.param('id');
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id));
    if (!campaign) return c.json({ error: 'Not found' }, 404);

    const pharmacyList = await db.select().from(campaignPharmacies).where(eq(campaignPharmacies.campaignId, id));
    const productList = await db.select().from(campaignProducts).where(eq(campaignProducts.campaignId, id));

    return c.json({ ...campaign, pharmacies: pharmacyList, products: productList });
  });

  app.post('/', async (c) => {
    const body = await c.req.json();

    const settingsParsed = CampaignSettingsSchema.safeParse(body.settings ?? {});
    if (!settingsParsed.success) {
      return c.json({ error: 'Invalid settings', details: settingsParsed.error.issues }, 400);
    }

    const [campaign] = await db.insert(campaigns).values({
      name: body.name,
      scriptId: body.scriptId,
      waSessionId: body.waSessionId,
      settings: settingsParsed.data,
    }).returning();

    if (body.pharmacyIds?.length) {
      await db.insert(campaignPharmacies).values(
        body.pharmacyIds.map((pharmacyId: string) => ({
          campaignId: campaign!.id,
          pharmacyId,
        })),
      );
    }

    // Support both legacy productIds (from products table) and anvisaProductIds (from Anvisa catalog)
    const allProductIds: string[] = [...(body.productIds ?? [])];

    if (body.anvisaProductIds?.length) {
      // Auto-create products entries for each Anvisa product
      const anvisaRows = await db
        .select()
        .from(anvisaProducts)
        .where(inArray(anvisaProducts.id, body.anvisaProductIds));

      const typeMap: Record<string, 'reference' | 'similar' | 'generic'> = {
        'Novo': 'reference',
        'Similar': 'similar',
        'Genérico': 'generic',
      };

      for (const anvisa of anvisaRows) {
        // Check if a product already exists linked to this Anvisa product
        const [existing] = await db
          .select({ id: products.id })
          .from(products)
          .where(eq(products.anvisaProductId, anvisa.id))
          .limit(1);

        if (existing) {
          allProductIds.push(existing.id);
        } else {
          const [newProduct] = await db.insert(products).values({
            name: anvisa.produto,
            activeIngredient: anvisa.substancia,
            brand: anvisa.laboratorio,
            dosage: anvisa.apresentacao,
            productType: typeMap[anvisa.tipoProduto] ?? 'reference' as const,
            anvisaProductId: anvisa.id,
          }).returning();
          if (newProduct) allProductIds.push(newProduct.id);
        }
      }
    }

    if (allProductIds.length > 0) {
      await db.insert(campaignProducts).values(
        allProductIds.map((productId: string, i: number) => ({
          campaignId: campaign!.id,
          productId,
          role: i === 0 ? 'survey' as const : 'competitor' as const,
        })),
      );
    }

    return c.json(campaign, 201);
  });

  app.post('/:id/start', async (c) => {
    const id = c.req.param('id');
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id));
    if (!campaign) return c.json({ error: 'Not found' }, 404);
    if (campaign.status !== 'draft' && campaign.status !== 'paused') {
      return c.json({ error: `Cannot start campaign in status: ${campaign.status}` }, 400);
    }

    await db.update(campaigns).set({ status: 'running', updatedAt: new Date() }).where(eq(campaigns.id, id));

    await campaignQueue.add('spawn', { campaignId: id, traceId: crypto.randomUUID() });

    return c.json({ status: 'started' });
  });

  app.post('/:id/pause', async (c) => {
    const id = c.req.param('id');
    await db.update(campaigns).set({ status: 'paused', updatedAt: new Date() }).where(eq(campaigns.id, id));
    return c.json({ status: 'paused' });
  });

  app.delete('/:id', async (c) => {
    const id = c.req.param('id');
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id));
    if (!campaign) return c.json({ error: 'Not found' }, 404);
    if (campaign.status === 'running') {
      return c.json({ error: 'Cannot delete a running campaign. Pause it first.' }, 400);
    }

    // Delete in FK order: productFindings → extractionResults → messages → events → conversations → campaignPharmacies → campaignProducts → reports → campaign
    const convos = await db.select({ id: conversations.id }).from(conversations).where(eq(conversations.campaignId, id));
    const convoIds = convos.map((c) => c.id);

    if (convoIds.length > 0) {
      const extractions = await db.select({ id: extractionResults.id }).from(extractionResults).where(inArray(extractionResults.conversationId, convoIds));
      const extractionIds = extractions.map((e) => e.id);
      if (extractionIds.length > 0) {
        await db.delete(productFindings).where(inArray(productFindings.extractionResultId, extractionIds));
        await db.delete(extractionResults).where(inArray(extractionResults.id, extractionIds));
      }
      await db.delete(messages).where(inArray(messages.conversationId, convoIds));
      await db.delete(conversationEvents).where(inArray(conversationEvents.conversationId, convoIds));
      await db.delete(conversations).where(inArray(conversations.id, convoIds));
    }

    await db.delete(campaignPharmacies).where(eq(campaignPharmacies.campaignId, id));
    await db.delete(campaignProducts).where(eq(campaignProducts.campaignId, id));
    await db.delete(campaignReports).where(eq(campaignReports.campaignId, id));
    await db.delete(campaigns).where(eq(campaigns.id, id));

    return c.json({ status: 'deleted' });
  });

  return app;
}
