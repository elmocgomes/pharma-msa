import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { extractionResults, productFindings, conversations, pharmacies, type Db } from '@pharma/db';

export function createResultRoutes(db: Db) {
  const app = new Hono();

  app.get('/', async (c) => {
    const campaignId = c.req.query('campaignId');
    if (!campaignId) return c.json({ error: 'campaignId required' }, 400);

    const result = await db
      .select({
        conversationId: conversations.id,
        pharmacyName: pharmacies.name,
        pharmacyPhone: pharmacies.phoneNumber,
        pharmacyCity: pharmacies.city,
        conversationStatus: conversations.status,
        extraction: extractionResults.rawAnalysis,
        completedAt: conversations.completedAt,
      })
      .from(conversations)
      .innerJoin(pharmacies, eq(conversations.pharmacyId, pharmacies.id))
      .leftJoin(extractionResults, eq(extractionResults.conversationId, conversations.id))
      .where(eq(conversations.campaignId, campaignId));

    return c.json(result);
  });

  app.get('/findings', async (c) => {
    const campaignId = c.req.query('campaignId');
    if (!campaignId) return c.json({ error: 'campaignId required' }, 400);

    const result = await db
      .select()
      .from(productFindings)
      .innerJoin(extractionResults, eq(productFindings.extractionResultId, extractionResults.id))
      .innerJoin(conversations, eq(extractionResults.conversationId, conversations.id))
      .where(eq(conversations.campaignId, campaignId));

    return c.json(result);
  });

  return app;
}
