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

  // Scrape WhatsApp numbers from Pague Menos store locator API
  app.post('/scrape-pague-menos', async (c) => {
    type PagueStore = {
      celular_loja: string | null;
      ddd: string | null;
      fixo_loja: string | null;
      cep: string | null;
      cidade: string | null;
      uf: string | null;
      nome_loja: string | null;
      endereco: string | null;
      bairro: string | null;
      bandeira: string | null;
      status: string | null;
      cod_loja: string | null;
    };

    // Get distinct city+state combos from our DB for Pague Menos pharmacies
    const cityStates = await db.selectDistinct({
      city: pharmacies.city,
      state: pharmacies.state,
    }).from(pharmacies)
      .where(sql`${pharmacies.chainName} IN ('Pague Menos', 'Extrafarma') AND ${pharmacies.city} IS NOT NULL AND ${pharmacies.state} IS NOT NULL`);

    const allStores = new Map<string, PagueStore>();

    for (const { city, state } of cityStates) {
      if (!city || !state) continue;
      try {
        const addr = `${city} - ${state}, Brasil`;
        const url = `https://www.paguemenos.com.br/_v/get-store-base-by-address/${encodeURIComponent(addr)}`;
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        });
        if (res.ok) {
          const stores = await res.json() as PagueStore[];
          if (Array.isArray(stores)) {
            for (const s of stores) {
              if (s.status === 'ATIVA' && s.cod_loja) {
                allStores.set(s.cod_loja, s);
              }
            }
          }
        }
      } catch {
        // Skip failed cities
      }
      await new Promise(r => setTimeout(r, 200));
    }

    const uniqueStores = [...allStores.values()];
    let matched = 0;
    let updated = 0;
    let noPhone = 0;

    for (const store of uniqueStores) {
      if (!store.celular_loja || !store.ddd) {
        noPhone++;
        continue;
      }

      const whatsappNumber = `55${store.ddd}${store.celular_loja}`;
      const normalizedCep = (store.cep ?? '').replace(/\D/g, '');

      let matchedIds: { id: string }[] = [];
      if (normalizedCep.length >= 7) {
        matchedIds = await db.select({ id: pharmacies.id })
          .from(pharmacies)
          .where(and(
            sql`REPLACE(${pharmacies.cep}, '-', '') = ${normalizedCep}`,
            sql`(${pharmacies.chainName} IN ('Pague Menos', 'Extrafarma') OR UPPER(COALESCE(${pharmacies.razaoSocial}, '')) LIKE '%PAGUE MENOS%' OR UPPER(COALESCE(${pharmacies.razaoSocial}, '')) LIKE '%EXTRAFARMA%' OR UPPER(COALESCE(${pharmacies.razaoSocial}, '')) LIKE '%EMPREENDIMENTOS PAGUE MENOS%')`,
          ))
          .limit(3);
      }

      if (matchedIds.length === 0 && store.cidade && store.uf) {
        matchedIds = await db.select({ id: pharmacies.id })
          .from(pharmacies)
          .where(and(
            sql`UPPER(${pharmacies.city}) = ${store.cidade.toUpperCase()}`,
            eq(pharmacies.state, store.uf),
            sql`(${pharmacies.chainName} IN ('Pague Menos', 'Extrafarma') OR UPPER(COALESCE(${pharmacies.razaoSocial}, '')) LIKE '%PAGUE MENOS%' OR UPPER(COALESCE(${pharmacies.razaoSocial}, '')) LIKE '%EXTRAFARMA%')`,
            sql`${pharmacies.whatsappNumber} IS NULL`,
          ))
          .limit(1);
      }

      if (matchedIds.length > 0) {
        matched += matchedIds.length;
        for (const { id } of matchedIds) {
          await db.update(pharmacies).set({
            whatsappNumber,
            whatsappVerified: true,
            lastScrapedAt: new Date(),
            scrapeSource: 'pague-menos-website',
            updatedAt: new Date(),
          }).where(eq(pharmacies.id, id));
          updated++;
        }
      }
    }

    return c.json({
      storesFetched: uniqueStores.length,
      withPhone: uniqueStores.length - noPhone,
      noPhone,
      matched,
      updated,
    });
  });

  // Scrape WhatsApp numbers from Raia Drogasil store locator
  // Uses phone numbers from their Next.js store locator pages
  app.post('/scrape-raia-drogasil', async (c) => {
    const STATE_SEARCH: Record<string, string> = {
      SP: 'sao+paulo', RJ: 'rio+de+janeiro', PR: 'parana', RS: 'rio+grande+do+sul',
      SC: 'santa+catarina', MG: 'minas+gerais', BA: 'bahia', CE: 'ceara',
      GO: 'goias', MT: 'mato+grosso', MS: 'mato+grosso+do+sul', PE: 'pernambuco',
      ES: 'espirito+santo', DF: 'distrito+federal', PA: 'para', AM: 'amazonas',
      MA: 'maranhao', PB: 'paraiba', RN: 'rio+grande+do+norte', PI: 'piaui',
      SE: 'sergipe', AL: 'alagoas', TO: 'tocantins', RO: 'rondonia',
      AC: 'acre', AP: 'amapa', RR: 'roraima',
    };

    type RdStore = {
      telephone: string | null;
      telephoneAreaCode: number | null;
      fantasyName: string | null;
      storeName: string | null;
      address: {
        regionId: string;
        cityName: string;
        neighborhood: string;
        street: string;
        number: string;
        postcode: string;
      };
    };

    const allStores: RdStore[] = [];
    const brands = ['drogaraia.com.br', 'drogasil.com.br'];

    for (const brand of brands) {
      for (const [, stateSlug] of Object.entries(STATE_SEARCH)) {
        let page = 1;
        let totalPages = 1;

        while (page <= totalPages && page <= 100) {
          try {
            const url = `https://www.${brand}/nossas-lojas?estado=${stateSlug}&page=${page}`;
            const res = await fetch(url, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'pt-BR,pt;q=0.9',
              },
            });

            if (!res.ok) break;

            const html = await res.text();
            const ndMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/);
            if (!ndMatch) break;

            const nextData = JSON.parse(ndMatch[1]!);
            const storesData = nextData?.props?.pageProps?.storesData;
            if (!storesData?.items?.length) break;

            allStores.push(...storesData.items);
            totalPages = storesData.page_info?.total_pages ?? 1;
            page++;
          } catch {
            break;
          }
          await new Promise(r => setTimeout(r, 500));
        }
      }
    }

    // Deduplicate by postcode + storeName
    const seen = new Set<string>();
    const uniqueStores = allStores.filter(s => {
      const key = `${s.address?.postcode}-${s.fantasyName}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    let matched = 0;
    let updated = 0;

    for (const store of uniqueStores) {
      if (!store.telephone || !store.telephoneAreaCode) continue;

      const phone = `55${store.telephoneAreaCode}${store.telephone.trim()}`;
      const normalizedCep = (store.address?.postcode ?? '').replace(/\D/g, '');

      let matchedIds: { id: string }[] = [];
      if (normalizedCep.length >= 7) {
        matchedIds = await db.select({ id: pharmacies.id })
          .from(pharmacies)
          .where(and(
            sql`REPLACE(${pharmacies.cep}, '-', '') = ${normalizedCep}`,
            sql`${pharmacies.chainName} = 'Raia Drogasil' OR UPPER(COALESCE(${pharmacies.razaoSocial}, '')) LIKE '%RAIA%' OR UPPER(COALESCE(${pharmacies.razaoSocial}, '')) LIKE '%DROGASIL%'`,
          ))
          .limit(3);
      }

      if (matchedIds.length > 0) {
        matched += matchedIds.length;
        for (const { id } of matchedIds) {
          // Store phone (not WhatsApp) — RD doesn't expose WhatsApp numbers
          // But update phone2 if we got a new number and mark as scraped
          await db.update(pharmacies).set({
            phone2: phone,
            lastScrapedAt: new Date(),
            scrapeSource: 'raia-drogasil-website',
            updatedAt: new Date(),
          }).where(eq(pharmacies.id, id));
          updated++;
        }
      }
    }

    return c.json({
      storesFetched: uniqueStores.length,
      matched,
      updated,
      note: 'Raia Drogasil does not expose WhatsApp numbers. Phone numbers saved to phone2 field.',
    });
  });

  // Import pre-fetched Panvel store data and match to DB
  // Panvel API is WAF-protected, so data is fetched client-side and POSTed here
  app.post('/import-panvel', async (c) => {
    type PanvelStore = {
      id: number;
      cnpj: string;
      name: string;
      cellPhone: string | null;
      zipCode: string;
      city: string;
      state: string;
    };

    const { stores } = await c.req.json() as { stores: PanvelStore[] };
    if (!Array.isArray(stores)) return c.json({ error: 'stores array required' }, 400);

    let matched = 0;
    let updated = 0;
    let noPhone = 0;

    for (const store of stores) {
      if (!store.cellPhone) { noPhone++; continue; }

      const phone = store.cellPhone.replace(/\D/g, '');
      const whatsappNumber = phone.startsWith('55') ? phone : `55${phone}`;
      const normalizedCep = store.zipCode.replace(/\D/g, '');

      let matchedIds: { id: string }[] = [];

      // Match by CNPJ first (most reliable)
      if (store.cnpj) {
        matchedIds = await db.select({ id: pharmacies.id })
          .from(pharmacies)
          .where(and(
            sql`REPLACE(REPLACE(REPLACE(${pharmacies.cnpj}, '.', ''), '/', ''), '-', '') = REPLACE(REPLACE(REPLACE(${store.cnpj}, '.', ''), '/', ''), '-', '')`,
            sql`${pharmacies.chainName} = 'Panvel' OR UPPER(COALESCE(${pharmacies.razaoSocial}, '')) LIKE '%PANVEL%' OR UPPER(COALESCE(${pharmacies.razaoSocial}, '')) LIKE '%DIMED%'`,
          ))
          .limit(3);
      }

      // Fallback: match by CEP
      if (matchedIds.length === 0 && normalizedCep.length >= 7) {
        matchedIds = await db.select({ id: pharmacies.id })
          .from(pharmacies)
          .where(and(
            sql`REPLACE(${pharmacies.cep}, '-', '') = ${normalizedCep}`,
            sql`${pharmacies.chainName} = 'Panvel' OR UPPER(COALESCE(${pharmacies.razaoSocial}, '')) LIKE '%PANVEL%' OR UPPER(COALESCE(${pharmacies.razaoSocial}, '')) LIKE '%DIMED%'`,
          ))
          .limit(3);
      }

      // Fallback: match by city+state+chain
      if (matchedIds.length === 0 && store.city && store.state) {
        matchedIds = await db.select({ id: pharmacies.id })
          .from(pharmacies)
          .where(and(
            sql`UPPER(${pharmacies.city}) = ${store.city.toUpperCase()}`,
            eq(pharmacies.state, store.state),
            sql`${pharmacies.chainName} = 'Panvel' OR UPPER(COALESCE(${pharmacies.razaoSocial}, '')) LIKE '%PANVEL%' OR UPPER(COALESCE(${pharmacies.razaoSocial}, '')) LIKE '%DIMED%'`,
            sql`${pharmacies.whatsappNumber} IS NULL`,
          ))
          .limit(1);
      }

      if (matchedIds.length > 0) {
        matched += matchedIds.length;
        for (const { id } of matchedIds) {
          await db.update(pharmacies).set({
            whatsappNumber: whatsappNumber,
            whatsappVerified: true,
            lastScrapedAt: new Date(),
            scrapeSource: 'panvel-website',
            updatedAt: new Date(),
          }).where(eq(pharmacies.id, id));
          updated++;
        }
      }
    }

    return c.json({
      storesReceived: stores.length,
      withPhone: stores.length - noPhone,
      noPhone,
      matched,
      updated,
    });
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

  // Diagnostic: check chain WhatsApp coverage
  app.get('/chain-whatsapp', async (c) => {
    const rows = await db.select({
      chainName: pharmacies.chainName,
      total: count(),
      withWhatsapp: sql<number>`count(*) FILTER (WHERE whatsapp_number IS NOT NULL)`,
      withoutWhatsapp: sql<number>`count(*) FILTER (WHERE whatsapp_number IS NULL)`,
    }).from(pharmacies)
      .where(isNotNull(pharmacies.chainName))
      .groupBy(pharmacies.chainName)
      .orderBy(sql`count(*) DESC`)
      .limit(30);

    return c.json(rows);
  });

  // Diagnostic: check Panvel matching details
  app.get('/panvel-debug', async (c) => {
    const panvelPharmacies = await db.select({
      total: count(),
      withWhatsapp: sql<number>`count(*) FILTER (WHERE whatsapp_number IS NOT NULL)`,
      panvelSource: sql<number>`count(*) FILTER (WHERE scrape_source = 'panvel-website')`,
    }).from(pharmacies)
      .where(sql`chain_name = 'Panvel' OR UPPER(COALESCE(razao_social, '')) LIKE '%PANVEL%' OR UPPER(COALESCE(razao_social, '')) LIKE '%DIMED%'`);

    const sampleWithWhatsapp = await db.select({
      cnpj: pharmacies.cnpj,
      razaoSocial: pharmacies.razaoSocial,
      chainName: pharmacies.chainName,
      city: pharmacies.city,
      state: pharmacies.state,
      whatsappNumber: pharmacies.whatsappNumber,
      scrapeSource: pharmacies.scrapeSource,
    }).from(pharmacies)
      .where(sql`scrape_source = 'panvel-website'`)
      .limit(10);

    const sampleWithout = await db.select({
      cnpj: pharmacies.cnpj,
      razaoSocial: pharmacies.razaoSocial,
      chainName: pharmacies.chainName,
      city: pharmacies.city,
      state: pharmacies.state,
      cep: pharmacies.cep,
    }).from(pharmacies)
      .where(sql`(chain_name = 'Panvel' OR UPPER(COALESCE(razao_social, '')) LIKE '%PANVEL%' OR UPPER(COALESCE(razao_social, '')) LIKE '%DIMED%') AND whatsapp_number IS NULL`)
      .limit(10);

    return c.json({ summary: panvelPharmacies[0], matchedSample: sampleWithWhatsapp, unmatchedSample: sampleWithout });
  });

  return app;
}

function count() {
  return sql<number>`count(*)`;
}
