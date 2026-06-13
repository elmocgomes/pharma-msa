import { Hono } from 'hono';
import { eq, ilike, or, sql, count } from 'drizzle-orm';
import { pharmacies, type Db } from '@pharma/db';

export function createPharmacyRoutes(db: Db) {
  const app = new Hono();

  app.get('/', async (c) => {
    const page = parseInt(c.req.query('page') ?? '1');
    const limit = Math.min(parseInt(c.req.query('limit') ?? '100'), 500);
    const q = c.req.query('q');
    const state = c.req.query('state');
    const chain = c.req.query('chain');
    const offset = (page - 1) * limit;

    const conditions = [];
    if (q) {
      conditions.push(or(
        ilike(pharmacies.name, `%${q}%`),
        ilike(pharmacies.cnpj, `%${q}%`),
        ilike(pharmacies.razaoSocial, `%${q}%`),
        ilike(pharmacies.nomeFantasia, `%${q}%`),
        ilike(pharmacies.phoneNumber, `%${q}%`),
        ilike(pharmacies.city, `%${q}%`),
      ));
    }
    if (state) conditions.push(eq(pharmacies.state, state));
    if (chain) conditions.push(eq(pharmacies.chainName, chain));

    const where = conditions.length > 0
      ? conditions.length === 1 ? conditions[0] : sql`${conditions[0]} AND ${conditions.slice(1).reduce((a, b) => sql`${a} AND ${b}`)}`
      : undefined;

    const [data, [total]] = await Promise.all([
      where
        ? db.select().from(pharmacies).where(where).orderBy(pharmacies.name).limit(limit).offset(offset)
        : db.select().from(pharmacies).orderBy(pharmacies.name).limit(limit).offset(offset),
      where
        ? db.select({ count: count() }).from(pharmacies).where(where)
        : db.select({ count: count() }).from(pharmacies),
    ]);

    return c.json({
      data,
      pagination: { page, limit, total: total?.count ?? 0, pages: Math.ceil((total?.count ?? 0) / limit) },
    });
  });

  app.get('/chains', async (c) => {
    const result = await db.select({
      chainName: pharmacies.chainName,
      count: count(),
    }).from(pharmacies)
      .where(sql`${pharmacies.chainName} IS NOT NULL`)
      .groupBy(pharmacies.chainName)
      .orderBy(sql`count(*) DESC`);
    return c.json(result);
  });

  app.get('/states', async (c) => {
    const result = await db.select({
      state: pharmacies.state,
      count: count(),
    }).from(pharmacies)
      .where(sql`${pharmacies.state} IS NOT NULL`)
      .groupBy(pharmacies.state)
      .orderBy(pharmacies.state);
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

  // Bulk upsert by CNPJ — used by the import script
  app.post('/import', async (c) => {
    const { records } = await c.req.json() as { records: Record<string, unknown>[] };
    if (!Array.isArray(records) || records.length === 0) {
      return c.json({ error: 'records array required' }, 400);
    }

    let inserted = 0;
    let updated = 0;
    let errors = 0;

    // Process in chunks of 100
    for (let i = 0; i < records.length; i += 100) {
      const chunk = records.slice(i, i + 100);
      for (const rec of chunk) {
        try {
          if (rec.cnpj) {
            const [existing] = await db.select({ id: pharmacies.id })
              .from(pharmacies).where(eq(pharmacies.cnpj, rec.cnpj as string)).limit(1);
            if (existing) {
              await db.update(pharmacies).set({ ...rec, updatedAt: new Date() } as typeof pharmacies.$inferInsert)
                .where(eq(pharmacies.id, existing.id));
              updated++;
            } else {
              await db.insert(pharmacies).values(rec as typeof pharmacies.$inferInsert);
              inserted++;
            }
          } else {
            await db.insert(pharmacies).values(rec as typeof pharmacies.$inferInsert);
            inserted++;
          }
        } catch {
          errors++;
        }
      }
    }

    return c.json({ inserted, updated, errors, total: records.length });
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
