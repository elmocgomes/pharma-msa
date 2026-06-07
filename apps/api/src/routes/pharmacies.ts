import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { pharmacies, type Db } from '@pharma/db';

export function createPharmacyRoutes(db: Db) {
  const app = new Hono();

  app.get('/', async (c) => {
    const result = await db.select().from(pharmacies);
    return c.json(result);
  });

  app.get('/:id', async (c) => {
    const [pharmacy] = await db.select().from(pharmacies).where(eq(pharmacies.id, c.req.param('id')));
    if (!pharmacy) return c.json({ error: 'Not found' }, 404);
    return c.json(pharmacy);
  });

  app.post('/', async (c) => {
    const body = await c.req.json();
    const [pharmacy] = await db.insert(pharmacies).values(body).returning();
    return c.json(pharmacy, 201);
  });

  app.post('/bulk', async (c) => {
    const body = await c.req.json();
    const result = await db.insert(pharmacies).values(body).returning();
    return c.json(result, 201);
  });

  app.patch('/:id', async (c) => {
    const body = await c.req.json();
    const [updated] = await db.update(pharmacies).set({ ...body, updatedAt: new Date() }).where(eq(pharmacies.id, c.req.param('id'))).returning();
    if (!updated) return c.json({ error: 'Not found' }, 404);
    return c.json(updated);
  });

  app.delete('/:id', async (c) => {
    await db.delete(pharmacies).where(eq(pharmacies.id, c.req.param('id')));
    return c.json({ status: 'deleted' });
  });

  return app;
}
