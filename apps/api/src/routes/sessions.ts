import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { WhatsAppClient } from '@pharma/whatsapp';
import { waSessions, type Db } from '@pharma/db';

export function createSessionRoutes(db: Db, waClient: WhatsAppClient) {
  const app = new Hono();

  app.get('/', async (c) => {
    const sessions = await db.select().from(waSessions);
    return c.json(sessions);
  });

  app.get('/:id', async (c) => {
    const id = c.req.param('id');
    const [session] = await db.select().from(waSessions).where(eq(waSessions.id, id));
    if (!session) return c.json({ error: 'Not found' }, 404);
    return c.json(session);
  });

  app.post('/', async (c) => {
    const body = await c.req.json();
    const { name, personaName, personaCpf, personaDetails, dailyLimit } = body;

    const [session] = await db.insert(waSessions).values({
      name,
      personaName,
      personaCpf,
      personaDetails,
      dailyLimit: dailyLimit ?? 200,
    }).returning();

    return c.json(session, 201);
  });

  app.post('/:id/connect', async (c) => {
    const id = c.req.param('id');
    const [session] = await db.select().from(waSessions).where(eq(waSessions.id, id));
    if (!session) return c.json({ error: 'Not found' }, 404);

    const result = await waClient.startSession(session.name);
    await db.update(waSessions).set({ status: 'connecting', updatedAt: new Date() }).where(eq(waSessions.id, id));

    return c.json(result);
  });

  app.post('/:id/disconnect', async (c) => {
    const id = c.req.param('id');
    const [session] = await db.select().from(waSessions).where(eq(waSessions.id, id));
    if (!session) return c.json({ error: 'Not found' }, 404);

    await waClient.deleteSession(session.name);
    await db.update(waSessions).set({ status: 'disconnected', updatedAt: new Date() }).where(eq(waSessions.id, id));

    return c.json({ status: 'disconnected' });
  });

  app.patch('/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json();
    const { personaName, personaCpf, personaDetails, dailyLimit } = body;

    const [updated] = await db.update(waSessions).set({
      ...(personaName !== undefined && { personaName }),
      ...(personaCpf !== undefined && { personaCpf }),
      ...(personaDetails !== undefined && { personaDetails }),
      ...(dailyLimit !== undefined && { dailyLimit }),
      updatedAt: new Date(),
    }).where(eq(waSessions.id, id)).returning();

    if (!updated) return c.json({ error: 'Not found' }, 404);
    return c.json(updated);
  });

  return app;
}
