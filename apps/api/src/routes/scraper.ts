import { Hono } from 'hono';
import { eq, sql, and, isNotNull } from 'drizzle-orm';
import { pharmacies, type Db } from '@pharma/db';
import { WhatsAppClient } from '@pharma/whatsapp';
import { waSessions } from '@pharma/db';

export function createScraperRoutes(db: Db, waClient: WhatsAppClient) {
  const app = new Hono();

  // Check WhatsApp numbers for pharmacies in a given state
  // Uses wa-gateway's check-number endpoint
  app.post('/whatsapp-check', async (c) => {
    const { sessionId, state, limit: rawLimit } = await c.req.json();
    const limit = Math.min(rawLimit ?? 50, 200);

    const [session] = await db.select().from(waSessions).where(eq(waSessions.id, sessionId));
    if (!session) return c.json({ error: 'Session not found' }, 404);
    if (session.status !== 'connected') return c.json({ error: 'Session not connected' }, 400);

    // Get pharmacies without WhatsApp verification
    const conditions = [eq(pharmacies.whatsappVerified, false)];
    if (state) conditions.push(eq(pharmacies.state, state));
    conditions.push(isNotNull(pharmacies.phoneNumber));

    const targets = await db.select({
      id: pharmacies.id,
      phoneNumber: pharmacies.phoneNumber,
      phone2: pharmacies.phone2,
      name: pharmacies.name,
    }).from(pharmacies)
      .where(and(...conditions))
      .limit(limit);

    const results: { id: string; name: string; phone: string; isWhatsApp: boolean }[] = [];

    for (const ph of targets) {
      for (const phone of [ph.phoneNumber, ph.phone2].filter(Boolean) as string[]) {
        try {
          const isWa = await waClient.isRegistered(session.name, phone);
          if (isWa) {
            await db.update(pharmacies).set({
              whatsappNumber: phone,
              whatsappVerified: true,
              lastScrapedAt: new Date(),
              scrapeSource: 'wa-gateway',
              updatedAt: new Date(),
            }).where(eq(pharmacies.id, ph.id));
            results.push({ id: ph.id, name: ph.name, phone, isWhatsApp: true });
            break;
          }
        } catch {
          // Rate limit or error — skip
        }
        // Small delay to avoid rate limits
        await new Promise(r => setTimeout(r, 500));
      }

      // If neither phone worked, mark as verified (no WhatsApp)
      const found = results.find(r => r.id === ph.id);
      if (!found) {
        await db.update(pharmacies).set({
          whatsappVerified: true,
          lastScrapedAt: new Date(),
          scrapeSource: 'wa-gateway',
          updatedAt: new Date(),
        }).where(eq(pharmacies.id, ph.id));
        results.push({ id: ph.id, name: ph.name, phone: ph.phoneNumber, isWhatsApp: false });
      }
    }

    const withWa = results.filter(r => r.isWhatsApp).length;
    return c.json({ checked: results.length, withWhatsApp: withWa, results });
  });

  // Enrich chain/association data using known patterns
  app.post('/detect-chains', async (c) => {
    const CHAIN_PATTERNS: [string, string][] = [
      ['RAIA DROGASIL', 'Raia Drogasil'],
      ['DROGASIL', 'Raia Drogasil'],
      ['DROGA RAIA', 'Raia Drogasil'],
      ['DROGARIA ARAUJO', 'Drogaria Araújo'],
      ['PAGUE MENOS', 'Pague Menos'],
      ['EMPREENDIMENTOS PAGUE MENOS', 'Pague Menos'],
      ['DROGARIAS PACHECO', 'DPSP'],
      ['DROGARIA SAO PAULO', 'DPSP'],
      ['PANVEL', 'Panvel'],
      ['DIMED S', 'Panvel'],
      ['EXTRAFARMA', 'Extrafarma'],
      ['NISSEI', 'Nissei'],
      ['DROGARIA VENANCIO', 'Venâncio'],
      ['ULTRAFARMA', 'Ultrafarma'],
      ['DROGAL', 'Drogal'],
      ['DROGARIA CATARINENSE', 'Catarinense'],
      ['AGAFARMA', 'Agafarma'],
      ['FARMACIA SAO JOAO', 'São João'],
      ['BIG BEN', 'Big Ben'],
      ['FARMA PONTE', 'FarmaPonte'],
      ['ONOFRE', 'Onofre'],
      ['FARMACIA INDIANA', 'Indiana'],
      ['DROGARIAS GLOBO', 'Globo'],
      ['FARMACIAS GLOBO', 'Globo'],
      ['DROGARIA MODERNA', 'Moderna'],
      ['REDE DROGASMIL', 'Drogasmil'],
      ['DROGARIA ROSARIO', 'Rosário'],
      ['FARMACIA MINAS BRASIL', 'Minas Brasil'],
    ];

    const ASSOCIATION_MAP: Record<string, string> = {
      'Raia Drogasil': 'Abrafarma',
      'Pague Menos': 'Abrafarma',
      'DPSP': 'Abrafarma',
      'Panvel': 'Abrafarma',
      'Extrafarma': 'Abrafarma',
      'Nissei': 'Abrafarma',
      'Venâncio': 'Abrafarma',
      'Drogaria Araújo': 'Abrafarma',
      'Onofre': 'Abrafarma',
      'Agafarma': 'Febrafar',
      'FarmaPonte': 'Febrafar',
    };

    let updated = 0;
    for (const [pattern, chainName] of CHAIN_PATTERNS) {
      const association = ASSOCIATION_MAP[chainName] ?? null;
      const result = await db.execute(sql`
        UPDATE pharmacies
        SET chain_name = ${chainName},
            association_name = ${association},
            updated_at = now()
        WHERE UPPER(COALESCE(razao_social, '')) LIKE ${'%' + pattern + '%'}
          AND chain_name IS NULL
      `);
      const count = (result as unknown as { rowCount?: number }).rowCount ?? 0;
      if (count > 0) updated += count;
    }

    return c.json({ updated });
  });

  // Get scraping stats
  app.get('/stats', async (c) => {
    const [stats] = await db.select({
      total: count(),
      withWhatsApp: sql<number>`count(*) FILTER (WHERE whatsapp_number IS NOT NULL)`,
      verified: sql<number>`count(*) FILTER (WHERE whatsapp_verified = true)`,
      withChain: sql<number>`count(*) FILTER (WHERE chain_name IS NOT NULL)`,
      withAssociation: sql<number>`count(*) FILTER (WHERE association_name IS NOT NULL)`,
    }).from(pharmacies);

    const chains = await db.select({
      name: pharmacies.chainName,
      count: count(),
    }).from(pharmacies)
      .where(isNotNull(pharmacies.chainName))
      .groupBy(pharmacies.chainName)
      .orderBy(sql`count(*) DESC`)
      .limit(20);

    return c.json({ ...stats, topChains: chains });
  });

  return app;
}

function count() {
  return sql<number>`count(*)`;
}
