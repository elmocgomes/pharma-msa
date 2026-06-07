import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { products, type Db } from '@pharma/db';

export function createProductRoutes(db: Db) {
  const app = new Hono();

  app.get('/', async (c) => {
    const result = await db.select().from(products);
    return c.json(result);
  });

  app.get('/:id', async (c) => {
    const [product] = await db.select().from(products).where(eq(products.id, c.req.param('id')));
    if (!product) return c.json({ error: 'Not found' }, 404);
    return c.json(product);
  });

  app.post('/', async (c) => {
    const body = await c.req.json();
    const [product] = await db.insert(products).values(body).returning();
    return c.json(product, 201);
  });

  app.post('/bulk', async (c) => {
    const body = await c.req.json();
    const result = await db.insert(products).values(body).returning();
    return c.json(result, 201);
  });

  app.patch('/:id', async (c) => {
    const body = await c.req.json();
    const [updated] = await db.update(products).set({ ...body, updatedAt: new Date() }).where(eq(products.id, c.req.param('id'))).returning();
    if (!updated) return c.json({ error: 'Not found' }, 404);
    return c.json(updated);
  });

  app.delete('/:id', async (c) => {
    await db.delete(products).where(eq(products.id, c.req.param('id')));
    return c.json({ status: 'deleted' });
  });

  return app;
}
