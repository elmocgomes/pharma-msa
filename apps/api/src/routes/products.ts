import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { products, anvisaProducts, type Db } from '@pharma/db';

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

  // Import a product from the Anvisa catalog
  app.post('/from-anvisa/:anvisaId', async (c) => {
    const anvisaId = c.req.param('anvisaId');
    const [anvisa] = await db.select().from(anvisaProducts).where(eq(anvisaProducts.id, anvisaId));
    if (!anvisa) return c.json({ error: 'Anvisa product not found' }, 404);

    // Map Anvisa tipo to our product type
    const typeMap: Record<string, 'reference' | 'similar' | 'generic'> = {
      'Novo': 'reference',
      'Similar': 'similar',
      'Genérico': 'generic',
    };

    const [product] = await db.insert(products).values({
      name: anvisa.produto,
      activeIngredient: anvisa.substancia,
      brand: anvisa.laboratorio,
      dosage: anvisa.apresentacao,
      productType: typeMap[anvisa.tipoProduto] ?? 'reference' as const,
      anvisaProductId: anvisa.id,
    }).returning();

    return c.json(product, 201);
  });

  return app;
}
