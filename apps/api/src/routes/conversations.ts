import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { conversations, messages, extractionResults, productFindings, conversationEvents, type Db } from '@pharma/db';

export function createConversationRoutes(db: Db) {
  const app = new Hono();

  app.get('/', async (c) => {
    const campaignId = c.req.query('campaignId');
    const query = db.select().from(conversations);
    const result = campaignId
      ? await query.where(eq(conversations.campaignId, campaignId))
      : await query;
    return c.json(result);
  });

  app.get('/:id', async (c) => {
    const id = c.req.param('id');
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id));
    if (!conversation) return c.json({ error: 'Not found' }, 404);
    return c.json(conversation);
  });

  app.get('/:id/messages', async (c) => {
    const id = c.req.param('id');
    const result = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(messages.createdAt);
    return c.json(result);
  });

  app.get('/:id/events', async (c) => {
    const id = c.req.param('id');
    const result = await db.select().from(conversationEvents).where(eq(conversationEvents.conversationId, id)).orderBy(conversationEvents.sequenceNumber);
    return c.json(result);
  });

  app.get('/:id/extraction', async (c) => {
    const id = c.req.param('id');
    const [extraction] = await db.select().from(extractionResults).where(eq(extractionResults.conversationId, id));
    if (!extraction) return c.json({ error: 'No extraction yet' }, 404);

    const findings = await db.select().from(productFindings).where(eq(productFindings.extractionResultId, extraction.id));
    return c.json({ ...extraction, findings });
  });

  return app;
}
