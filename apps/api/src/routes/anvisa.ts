import { Hono } from 'hono';
import { eq, sql, and, or, count, desc, isNull } from 'drizzle-orm';
import { anvisaProducts, type Db } from '@pharma/db';
import { getPmcForState, STATE_ICMS_RATE, parseApresentacao } from '@pharma/shared';

export function createAnvisaRoutes(db: Db) {
  const app = new Hono();

  // ── Import Anvisa products from JSON payload ──
  // The XLSX parsing happens client-side (or via a script); this endpoint receives parsed rows
  app.post('/import', async (c) => {
    const body = await c.req.json<{
      products: Array<{
        substancia: string;
        produto: string;
        apresentacao: string;
        laboratorio?: string;
        tipoProduto: string;
        ean?: string;
        codigoGgrem?: string;
        registro?: string;
        classeTerapeutica?: string;
        tarja?: string;
        regimePreco?: string;
        pmcByIcms: Record<string, string>;
        pfByIcms?: Record<string, string>;
        restricaoHospitalar?: string;
        cap?: string;
        confaz87?: string;
        icms0?: string;
        comercializacao?: string;
        destinacaoComercial?: string;
      }>;
      dataPublicacao?: string;
      clearExisting?: boolean;
    }>();

    if (!body.products?.length) {
      return c.json({ error: 'No products provided' }, 400);
    }

    // Optional: clear existing data before import
    if (body.clearExisting) {
      await db.delete(anvisaProducts);
    }

    // Batch insert in chunks of 500
    const CHUNK_SIZE = 500;
    let inserted = 0;
    for (let i = 0; i < body.products.length; i += CHUNK_SIZE) {
      const chunk = body.products.slice(i, i + CHUNK_SIZE);
      const rows = chunk.map((p) => {
        const parsed = parseApresentacao(p.apresentacao);
        return {
        substancia: p.substancia,
        produto: p.produto,
        apresentacao: p.apresentacao,
        dosagem: parsed.dosagem,
        forma: parsed.forma,
        quantidade: parsed.quantidade,
        laboratorio: p.laboratorio ?? null,
        tipoProduto: p.tipoProduto,
        ean: cleanEan(p.ean),
        codigoGgrem: p.codigoGgrem ?? null,
        registro: p.registro ?? null,
        classeTerapeutica: p.classeTerapeutica ?? null,
        tarja: cleanTarja(p.tarja),
        regimePreco: p.regimePreco ?? null,
        pmcByIcms: p.pmcByIcms,
        pfByIcms: p.pfByIcms ?? null,
        restricaoHospitalar: p.restricaoHospitalar ?? null,
        cap: p.cap ?? null,
        confaz87: p.confaz87 ?? null,
        icms0: p.icms0 ?? null,
        comercializacao: p.comercializacao ?? null,
        destinacaoComercial: p.destinacaoComercial ?? null,
        dataPublicacao: body.dataPublicacao ?? null,
      };
      });
      await db.insert(anvisaProducts).values(rows);
      inserted += rows.length;
    }

    return c.json({ status: 'ok', imported: inserted });
  });

  // ── Search Anvisa products (paginated, fuzzy) ──
  app.get('/products', async (c) => {
    const q = c.req.query('q') ?? '';
    const tipo = c.req.query('tipo');
    const substancia = c.req.query('substancia');
    const classe = c.req.query('classe');
    const state = c.req.query('state'); // for PMC display
    const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') ?? '50', 10)));
    const offset = (page - 1) * limit;

    const conditions = [];
    if (q) {
      conditions.push(
        or(
          sql`${anvisaProducts.produto} ILIKE ${'%' + q + '%'}`,
          sql`${anvisaProducts.substancia} ILIKE ${'%' + q + '%'}`,
          sql`${anvisaProducts.laboratorio} ILIKE ${'%' + q + '%'}`,
        ),
      );
    }
    if (tipo) {
      conditions.push(eq(anvisaProducts.tipoProduto, tipo));
    }
    if (substancia) {
      conditions.push(sql`${anvisaProducts.substancia} ILIKE ${'%' + substancia + '%'}`);
    }
    if (classe) {
      conditions.push(sql`${anvisaProducts.classeTerapeutica} ILIKE ${'%' + classe + '%'}`);
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, [total]] = await Promise.all([
      db
        .select()
        .from(anvisaProducts)
        .where(where)
        .orderBy(anvisaProducts.produto, anvisaProducts.apresentacao)
        .limit(limit)
        .offset(offset),
      db
        .select({ count: count() })
        .from(anvisaProducts)
        .where(where),
    ]);

    // If a state is provided, add the PMC for that state to each row
    const enriched = rows.map((r) => ({
      ...r,
      pmc: state ? getPmcForState(r.pmcByIcms as Record<string, string>, state) : undefined,
      icmsRate: state ? STATE_ICMS_RATE[state.toUpperCase()] : undefined,
    }));

    return c.json({
      data: enriched,
      pagination: {
        page,
        limit,
        total: total?.count ?? 0,
        pages: Math.ceil((total?.count ?? 0) / limit),
      },
    });
  });

  // ── Get single Anvisa product ──
  app.get('/products/:id', async (c) => {
    const id = c.req.param('id');
    const state = c.req.query('state');
    const [product] = await db.select().from(anvisaProducts).where(eq(anvisaProducts.id, id));
    if (!product) return c.json({ error: 'Not found' }, 404);

    // Compute PMC for all states
    const pmcAllStates: Record<string, number | null> = {};
    for (const uf of Object.keys(STATE_ICMS_RATE)) {
      const pmcMap = product.pmcByIcms as Record<string, string>;
      pmcAllStates[uf] = getPmcForState(pmcMap, uf);
    }

    return c.json({
      ...product,
      pmc: state ? getPmcForState(product.pmcByIcms as Record<string, string>, state) : undefined,
      pmcAllStates,
    });
  });

  // ── Find competing products (same substance) ──
  app.get('/products/by-substance/:substance', async (c) => {
    const substance = decodeURIComponent(c.req.param('substance'));
    const state = c.req.query('state');
    const dosagem = c.req.query('dosagem');
    const forma = c.req.query('forma');

    const conditions = [eq(anvisaProducts.substancia, substance)];
    if (dosagem) conditions.push(eq(anvisaProducts.dosagem, dosagem));
    if (forma) conditions.push(eq(anvisaProducts.forma, forma));

    const rows = await db
      .select()
      .from(anvisaProducts)
      .where(and(...conditions))
      .orderBy(anvisaProducts.tipoProduto, anvisaProducts.produto);

    const enriched = rows.map((r) => ({
      ...r,
      pmc: state ? getPmcForState(r.pmcByIcms as Record<string, string>, state) : undefined,
    }));

    return c.json({
      substance,
      count: enriched.length,
      products: enriched,
    });
  });

  // ── Get stats about the imported data ──
  app.get('/stats', async (c) => {
    const stats = await db
      .select({
        tipoProduto: anvisaProducts.tipoProduto,
        count: count(),
      })
      .from(anvisaProducts)
      .groupBy(anvisaProducts.tipoProduto)
      .orderBy(desc(count()));

    const [total] = await db.select({ count: count() }).from(anvisaProducts);

    return c.json({
      total: total?.count ?? 0,
      byType: stats,
    });
  });

  // ── Get ICMS rates and state mapping ──
  app.get('/icms-rates', (c) => {
    return c.json({
      stateRates: STATE_ICMS_RATE,
      availableRates: ['0', '12', '17', '17.5', '18', '19', '19.5', '20', '20.5', '21', '22', '22.5', '23'],
    });
  });

  // ── Backfill parsed apresentacao fields for existing rows ──
  app.post('/backfill-apresentacao', async (c) => {
    const BATCH = 1000;
    let updated = 0;
    let offset = 0;

    while (true) {
      const rows = await db
        .select({ id: anvisaProducts.id, apresentacao: anvisaProducts.apresentacao })
        .from(anvisaProducts)
        .where(isNull(anvisaProducts.dosagem))
        .limit(BATCH)
        .offset(offset);

      if (rows.length === 0) break;

      for (const row of rows) {
        const parsed = parseApresentacao(row.apresentacao);
        await db.update(anvisaProducts)
          .set({ dosagem: parsed.dosagem, forma: parsed.forma, quantidade: parsed.quantidade })
          .where(eq(anvisaProducts.id, row.id));
      }

      updated += rows.length;
      if (rows.length < BATCH) break;
    }

    return c.json({ status: 'ok', updated });
  });

  return app;
}

function cleanEan(ean?: string): string | null {
  if (!ean) return null;
  const cleaned = ean.trim();
  if (cleaned === '-' || cleaned === '    -     ' || cleaned === '') return null;
  return cleaned;
}

function cleanTarja(tarja?: string): string | null {
  if (!tarja) return null;
  const cleaned = tarja.trim();
  if (cleaned.startsWith('Tarja ')) return cleaned.replace('Tarja ', '');
  return cleaned;
}
