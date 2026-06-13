import { Hono } from 'hono';
import { eq, sql, count } from 'drizzle-orm';
import { pharmacies, type Db } from '@pharma/db';

const SAFE_COLUMNS: Record<string, string> = {
  name: 'name',
  cnpj: 'cnpj',
  phoneNumber: 'phone_number',
  whatsappNumber: 'whatsapp_number',
  city: 'city',
  state: 'state',
  bairro: 'bairro',
  chainName: 'chain_name',
  associationName: 'association_name',
  porte: 'porte',
  nomeFantasia: 'nome_fantasia',
  razaoSocial: 'razao_social',
  email: 'email',
  logradouro: 'logradouro',
  cep: 'cep',
  naturezaJuridica: 'natureza_juridica',
  whatsappVerified: 'whatsapp_verified',
  createdAt: 'created_at',
};

type FilterNode = {
  filterType: string;
  type?: string;
  filter?: string;
  colId?: string;
  conditions?: FilterNode[];
};

function buildFilterSql(node: FilterNode): ReturnType<typeof sql> | null {
  if (!node || !node.filterType) return null;

  if (node.filterType === 'join') {
    const parts = (node.conditions ?? []).map(buildFilterSql).filter((p): p is NonNullable<typeof p> => p !== null);
    if (parts.length === 0) return null;
    if (parts.length === 1) return parts[0]!;
    const joiner = node.type === 'OR' ? sql` OR ` : sql` AND `;
    return sql`(${parts.reduce((a, b) => sql`${a}${joiner}${b}`)})`;
  }

  if (node.filterType === 'text' && node.colId) {
    const dbCol = SAFE_COLUMNS[node.colId];
    if (!dbCol) return null;
    const col = sql.raw(`"${dbCol}"`);
    const val = node.filter ?? '';
    switch (node.type) {
      case 'contains': return sql`${col} ILIKE ${'%' + val + '%'}`;
      case 'notContains': return sql`${col} NOT ILIKE ${'%' + val + '%'}`;
      case 'equals': return sql`${col} ILIKE ${val}`;
      case 'notEqual': return sql`${col} NOT ILIKE ${val}`;
      case 'startsWith': return sql`${col} ILIKE ${val + '%'}`;
      case 'endsWith': return sql`${col} ILIKE ${'%' + val}`;
      case 'blank': return sql`${col} IS NULL OR ${col} = ''`;
      case 'notBlank': return sql`${col} IS NOT NULL AND ${col} != ''`;
      default: return sql`${col} ILIKE ${'%' + val + '%'}`;
    }
  }

  if (node.filterType === 'boolean' && node.colId) {
    const dbCol = SAFE_COLUMNS[node.colId];
    if (!dbCol) return null;
    const col = sql.raw(`"${dbCol}"`);
    return node.type === 'true' ? sql`${col} = true` : sql`${col} = false`;
  }

  return null;
}

export function createPharmacyRoutes(db: Db) {
  const app = new Hono();

  app.get('/', async (c) => {
    const page = parseInt(c.req.query('page') ?? '1');
    const limit = Math.min(parseInt(c.req.query('limit') ?? '100'), 500);
    const offset = (page - 1) * limit;

    const conditions = [];

    const filterModelRaw = c.req.query('filterModel');
    if (filterModelRaw) {
      try {
        const fm = JSON.parse(filterModelRaw) as FilterNode;
        const filterSql = buildFilterSql(fm);
        if (filterSql) conditions.push(filterSql);
      } catch { /* ignore invalid JSON */ }
    }

    const where = conditions.length > 0 ? conditions[0] : undefined;

    let orderClause = sql`"name" ASC`;
    const sortModelRaw = c.req.query('sortModel');
    if (sortModelRaw) {
      try {
        const sm = JSON.parse(sortModelRaw) as { colId: string; sort: string }[];
        if (sm.length > 0 && sm[0]) {
          const dbCol = SAFE_COLUMNS[sm[0].colId];
          if (dbCol) {
            orderClause = sm[0].sort === 'desc'
              ? sql.raw(`"${dbCol}" DESC NULLS LAST`)
              : sql.raw(`"${dbCol}" ASC NULLS LAST`);
          }
        }
      } catch { /* ignore */ }
    }

    const [data, [total]] = await Promise.all([
      where
        ? db.select().from(pharmacies).where(where).orderBy(orderClause).limit(limit).offset(offset)
        : db.select().from(pharmacies).orderBy(orderClause).limit(limit).offset(offset),
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
