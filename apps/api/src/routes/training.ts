import { Hono } from 'hono';
import { eq, and, desc } from 'drizzle-orm';
import {
  type Db, campaigns, campaignProducts, products, conversations, messages,
  pharmacies, waSessions, trainingEvaluations, insertMessageIdempotent,
} from '@pharma/db';
import { WhatsAppClient } from '@pharma/whatsapp';
import { formatProductForInquiry } from '@pharma/shared';
import type { LlmProvider } from '@pharma/ai';

export function createTrainingRoutes(db: Db, waClient: WhatsAppClient, extractorProvider?: LlmProvider) {
  const app = new Hono();

  // List training campaigns with their conversations
  app.get('/campaigns', async (c) => {
    const result = await db.select().from(campaigns)
      .where(eq(campaigns.mode, 'training'))
      .orderBy(desc(campaigns.createdAt));
    return c.json(result);
  });

  // Create a training conversation for a campaign + pharmacy
  app.post('/campaigns/:id/conversations', async (c) => {
    const campaignId = c.req.param('id');
    const { pharmacyId } = await c.req.json();

    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    if (!campaign) return c.json({ error: 'Campaign not found' }, 404);
    if (campaign.mode !== 'training') return c.json({ error: 'Not a training campaign' }, 400);

    const [pharmacy] = await db.select().from(pharmacies).where(eq(pharmacies.id, pharmacyId));
    if (!pharmacy) return c.json({ error: 'Pharmacy not found' }, 404);

    // Load survey product for variables
    const surveyProducts = await db
      .select({ product: products })
      .from(campaignProducts)
      .innerJoin(products, eq(campaignProducts.productId, products.id))
      .where(and(eq(campaignProducts.campaignId, campaignId), eq(campaignProducts.role, 'survey')));

    const competitorProducts = await db
      .select({ product: products })
      .from(campaignProducts)
      .innerJoin(products, eq(campaignProducts.productId, products.id))
      .where(and(eq(campaignProducts.campaignId, campaignId), eq(campaignProducts.role, 'competitor')));

    const firstProduct = surveyProducts[0]?.product;
    const variables: Record<string, string> = firstProduct ? {
      product_name: formatProductForInquiry(firstProduct),
      active_ingredient: firstProduct.activeIngredient ?? '',
      brand: firstProduct.brand ?? '',
      dosage: firstProduct.dosage ?? '',
      competitors: competitorProducts.map((cp) => formatProductForInquiry(cp.product)).join(', '),
    } : {};

    const [conv] = await db.insert(conversations).values({
      campaignId,
      pharmacyId,
      waSessionId: campaign.waSessionId,
      scriptId: campaign.scriptId,
      status: 'in_progress',
      variables,
      startedAt: new Date(),
    }).returning();

    return c.json(conv, 201);
  });

  // Get conversation with messages for the chat UI
  app.get('/conversations/:id', async (c) => {
    const id = c.req.param('id');
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
    if (!conv) return c.json({ error: 'Not found' }, 404);

    const msgs = await db.select().from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(messages.createdAt);

    const [pharmacy] = await db.select().from(pharmacies).where(eq(pharmacies.id, conv.pharmacyId));
    const [session] = await db.select().from(waSessions).where(eq(waSessions.id, conv.waSessionId));

    return c.json({ conversation: conv, messages: msgs, pharmacy, session });
  });

  // Send a message from the admin through WhatsApp
  app.post('/conversations/:id/send', async (c) => {
    const id = c.req.param('id');
    const { text } = await c.req.json();

    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
    if (!conv) return c.json({ error: 'Not found' }, 404);

    const [session] = await db.select().from(waSessions).where(eq(waSessions.id, conv.waSessionId));
    if (!session) return c.json({ error: 'Session not found' }, 404);

    const [pharmacy] = await db.select().from(pharmacies).where(eq(pharmacies.id, conv.pharmacyId));
    if (!pharmacy) return c.json({ error: 'Pharmacy not found' }, 404);

    await waClient.sendText({
      session: session.name,
      to: pharmacy.phoneNumber,
      text,
    });

    const msg = await insertMessageIdempotent(db, {
      conversationId: id,
      direction: 'outbound',
      content: text,
      idempotencyKey: `training:out:${id}:${Date.now()}`,
    });

    return c.json(msg);
  });

  // Complete a training conversation
  app.post('/conversations/:id/complete', async (c) => {
    const id = c.req.param('id');

    await db.update(conversations).set({
      status: 'completed',
      completedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(conversations.id, id));

    return c.json({ status: 'completed' });
  });

  // Run AI replay on a completed training conversation
  app.post('/conversations/:id/replay', async (c) => {
    const id = c.req.param('id');

    if (!extractorProvider) {
      return c.json({ error: 'AI provider not configured' }, 500);
    }

    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
    if (!conv) return c.json({ error: 'Not found' }, 404);

    const msgs = await db.select().from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(messages.createdAt);

    if (msgs.length === 0) return c.json({ error: 'No messages to replay' }, 400);

    // Load all campaign products for the extractor
    const allProducts = await db
      .select({ product: products })
      .from(campaignProducts)
      .innerJoin(products, eq(campaignProducts.productId, products.id))
      .where(eq(campaignProducts.campaignId, conv.campaignId));

    const productNames = allProducts.map((p) => p.product.name);

    const transcript = msgs.map((m) => ({
      role: m.direction === 'outbound' ? 'assistant' as const : 'user' as const,
      content: m.content,
    }));

    const { ExtractorAgent } = await import('@pharma/ai');
    const extractor = new ExtractorAgent(extractorProvider);
    const result = await extractor.extract({ conversationTranscript: transcript, productNames });

    // Store the evaluation
    const [evaluation] = await db.insert(trainingEvaluations).values({
      conversationId: id,
      extractionResult: result as unknown as Record<string, unknown>,
      status: 'pending',
    }).returning();

    return c.json({ evaluation, extraction: result });
  });

  // Get evaluation for a conversation
  app.get('/conversations/:id/evaluation', async (c) => {
    const id = c.req.param('id');
    const [evaluation] = await db.select().from(trainingEvaluations)
      .where(eq(trainingEvaluations.conversationId, id))
      .orderBy(desc(trainingEvaluations.createdAt))
      .limit(1);

    if (!evaluation) return c.json({ error: 'No evaluation yet' }, 404);
    return c.json(evaluation);
  });

  // Save admin corrections on an evaluation
  app.patch('/evaluations/:id', async (c) => {
    const id = c.req.param('id');
    const { corrections, notes } = await c.req.json();

    const [updated] = await db.update(trainingEvaluations).set({
      adminCorrections: corrections,
      notes,
      status: 'evaluated',
      updatedAt: new Date(),
    }).where(eq(trainingEvaluations.id, id)).returning();

    return c.json(updated);
  });

  return app;
}
