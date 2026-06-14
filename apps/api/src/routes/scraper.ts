import { Hono } from 'hono';
import { eq, sql, and, isNotNull } from 'drizzle-orm';
import { pharmacies, type Db } from '@pharma/db';
import { WhatsAppClient } from '@pharma/whatsapp';
import { waSessions } from '@pharma/db';

export function createScraperRoutes(db: Db, waClient: WhatsAppClient) {
  const app = new Hono();

  // Validate phone numbers against WhatsApp via wa-gateway
  // Checks phoneNumber and phone2 fields, updates whatsappNumber if registered
  app.post('/whatsapp-check', async (c) => {
    const { sessionId, state, chain, limit: rawLimit, delayMs: rawDelay } = await c.req.json() as {
      sessionId: string; state?: string; chain?: string; limit?: number; delayMs?: number;
    };
    const limit = Math.min(rawLimit ?? 50, 500);
    const delayMs = Math.max(rawDelay ?? 1000, 300);

    const [session] = await db.select().from(waSessions).where(eq(waSessions.id, sessionId));
    if (!session) return c.json({ error: 'Session not found' }, 404);
    if (session.status !== 'connected') return c.json({ error: 'Session not connected' }, 400);

    // Build conditions: no WhatsApp yet, has at least one phone number
    const conditions = [
      sql`${pharmacies.whatsappNumber} IS NULL`,
      sql`(${pharmacies.phoneNumber} IS NOT NULL OR ${pharmacies.phone2} IS NOT NULL)`,
    ];
    if (state) conditions.push(eq(pharmacies.state, state));
    if (chain) conditions.push(eq(pharmacies.chainName, chain));

    const targets = await db.select({
      id: pharmacies.id,
      phoneNumber: pharmacies.phoneNumber,
      phone2: pharmacies.phone2,
      name: pharmacies.name,
      chainName: pharmacies.chainName,
    }).from(pharmacies)
      .where(and(...conditions))
      .limit(limit);

    if (targets.length === 0) {
      return c.json({ checked: 0, withWhatsApp: 0, message: 'No pharmacies to check' });
    }

    const normalizePhone = (raw: string): string => {
      const digits = raw.replace(/\D/g, '');
      if (digits.startsWith('55') && digits.length >= 12) return digits;
      if (digits.length >= 10) return `55${digits}`;
      return digits;
    };

    const results: { id: string; name: string; chain: string | null; phone: string; isWhatsApp: boolean }[] = [];
    let errors = 0;

    for (const ph of targets) {
      const phones = [ph.phone2, ph.phoneNumber]
        .filter(Boolean)
        .map(p => normalizePhone(p!))
        .filter(p => p.length >= 12);

      // Deduplicate
      const uniquePhones = [...new Set(phones)];

      let found = false;
      for (const phone of uniquePhones) {
        try {
          const isWa = await waClient.isRegistered(session.name, phone);
          if (isWa) {
            await db.update(pharmacies).set({
              whatsappNumber: phone,
              whatsappVerified: true,
              lastScrapedAt: new Date(),
              scrapeSource: 'wa-validation',
              updatedAt: new Date(),
            }).where(eq(pharmacies.id, ph.id));
            results.push({ id: ph.id, name: ph.name, chain: ph.chainName, phone, isWhatsApp: true });
            found = true;
            break;
          }
        } catch {
          errors++;
        }
        await new Promise(r => setTimeout(r, delayMs));
      }

      if (!found) {
        // Mark as checked (whatsappVerified=true) so we don't re-check
        await db.update(pharmacies).set({
          whatsappVerified: true,
          lastScrapedAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(pharmacies.id, ph.id));
        results.push({ id: ph.id, name: ph.name, chain: ph.chainName, phone: uniquePhones[0] ?? '', isWhatsApp: false });
      }

      await new Promise(r => setTimeout(r, delayMs));
    }

    const withWa = results.filter(r => r.isWhatsApp).length;
    return c.json({
      checked: results.length,
      withWhatsApp: withWa,
      withoutWhatsApp: results.length - withWa,
      errors,
      results,
    });
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

  // Scrape phone numbers from Raia Drogasil via Next.js JSON data routes
  // RD doesn't expose WhatsApp — phones are saved to phone2 for later validation
  app.post('/scrape-raia-drogasil', async (c) => {
    const REGION_NAMES = [
      'São Paulo', 'Rio de Janeiro', 'Paraná', 'Rio Grande do Sul',
      'Santa Catarina', 'Minas Gerais', 'Ceará', 'Pernambuco',
      'Mato Grosso',
    ];

    type RdStore = {
      id: number;
      telephone: string | null;
      telephoneAreaCode: number | null;
      fantasyName: string | null;
      storeName: string | null;
      address: {
        regionId: string;
        regionName: string;
        cityName: string;
        neighborhood: string;
        street: string;
        number: string;
        postcode: string;
      };
    };

    const allStores: RdStore[] = [];
    const brands = ['drogaraia.com.br', 'drogasil.com.br'];
    const errors: string[] = [];

    for (const brand of brands) {
      // Discover the Next.js build ID from the HTML page
      let buildId: string | null = null;
      try {
        const htmlRes = await fetch(`https://www.${brand}/nossas-lojas`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        });
        if (htmlRes.ok) {
          const html = await htmlRes.text();
          const match = html.match(/\/_next\/static\/([^/]+)\/_buildManifest/);
          if (match) buildId = match[1]!;
        }
      } catch { /* fallback below */ }

      if (!buildId) {
        errors.push(`Could not discover buildId for ${brand}`);
        continue;
      }

      for (const region of REGION_NAMES) {
        let page = 1;
        let totalPages = 1;

        while (page <= totalPages && page <= 200) {
          try {
            const params = new URLSearchParams({ estado: region, limit: '100', page: String(page) });
            const url = `https://www.${brand}/seo/_next/data/${buildId}/nossas-lojas.json?${params}`;
            const res = await fetch(url, {
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            });

            if (!res.ok) break;
            const data = await res.json() as { pageProps?: { storesData?: { items?: RdStore[]; page_info?: { total_pages?: number } } } };
            const storesData = data?.pageProps?.storesData;
            if (!storesData?.items?.length) break;

            allStores.push(...storesData.items);
            totalPages = storesData.page_info?.total_pages ?? 1;
            page++;
          } catch {
            break;
          }
          await new Promise(r => setTimeout(r, 300));
        }
      }
    }

    // Deduplicate by postcode + storeName
    const seen = new Set<string>();
    const uniqueStores = allStores.filter(s => {
      const key = `${s.address?.postcode}-${s.storeName}-${s.fantasyName}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    let matched = 0;
    let updated = 0;
    let noPhone = 0;

    for (const store of uniqueStores) {
      if (!store.telephone || !store.telephoneAreaCode) { noPhone++; continue; }

      // Clean the phone: remove trailing spaces, split multiple numbers
      const rawPhone = store.telephone.trim().split('/')[0]!.trim();
      const phone = `55${store.telephoneAreaCode}${rawPhone}`;
      const normalizedCep = (store.address?.postcode ?? '').replace(/\D/g, '');

      if (normalizedCep.length < 7) continue;

      const matchedIds = await db.select({ id: pharmacies.id })
        .from(pharmacies)
        .where(and(
          sql`REPLACE(${pharmacies.cep}, '-', '') = ${normalizedCep}`,
          sql`${pharmacies.chainName} = 'Raia Drogasil' OR UPPER(COALESCE(${pharmacies.razaoSocial}, '')) LIKE '%RAIA%' OR UPPER(COALESCE(${pharmacies.razaoSocial}, '')) LIKE '%DROGASIL%'`,
        ))
        .limit(3);

      if (matchedIds.length > 0) {
        matched += matchedIds.length;
        for (const { id } of matchedIds) {
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
      withPhone: uniqueStores.length - noPhone,
      noPhone,
      matched,
      updated,
      errors: errors.length > 0 ? errors : undefined,
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

  // Diagnostic: WhatsApp validation opportunity — phones without WhatsApp
  app.get('/validation-opportunity', async (c) => {
    const rows = await db.select({
      chainName: pharmacies.chainName,
      total: count(),
      hasWhatsapp: sql<number>`count(*) FILTER (WHERE whatsapp_number IS NOT NULL)`,
      hasPhone2NoWa: sql<number>`count(*) FILTER (WHERE phone2 IS NOT NULL AND whatsapp_number IS NULL)`,
      hasPhoneNoWa: sql<number>`count(*) FILTER (WHERE phone_number IS NOT NULL AND whatsapp_number IS NULL AND phone2 IS NULL)`,
      alreadyChecked: sql<number>`count(*) FILTER (WHERE whatsapp_verified = true AND whatsapp_number IS NULL)`,
      unchecked: sql<number>`count(*) FILTER (WHERE whatsapp_verified = false AND (phone_number IS NOT NULL OR phone2 IS NOT NULL) AND whatsapp_number IS NULL)`,
    }).from(pharmacies)
      .where(isNotNull(pharmacies.chainName))
      .groupBy(pharmacies.chainName)
      .orderBy(sql`count(*) FILTER (WHERE whatsapp_verified = false AND (phone_number IS NOT NULL OR phone2 IS NOT NULL) AND whatsapp_number IS NULL) DESC`)
      .limit(30);

    const totals = rows.reduce((acc, r) => ({
      total: acc.total + Number(r.total),
      hasWhatsapp: acc.hasWhatsapp + Number(r.hasWhatsapp),
      hasPhone2NoWa: acc.hasPhone2NoWa + Number(r.hasPhone2NoWa),
      unchecked: acc.unchecked + Number(r.unchecked),
      alreadyChecked: acc.alreadyChecked + Number(r.alreadyChecked),
    }), { total: 0, hasWhatsapp: 0, hasPhone2NoWa: 0, unchecked: 0, alreadyChecked: 0 });

    return c.json({ totals, chains: rows });
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

  // Address matching for unmatched Panvel pharmacies
  // Phase 1: deterministic (normalized street+number). Phase 2: AI for remainder.
  app.post('/match-panvel-addresses', async (c) => {
    type PanvelStore = {
      id: number; cnpj: string; name: string; cellPhone: string | null;
      street: string; number: number | string; district: string;
      zipCode: string; city: string; state: string;
    };

    const { stores, apiKey } = await c.req.json() as { stores: PanvelStore[]; apiKey?: string };
    if (!Array.isArray(stores)) return c.json({ error: 'stores array required' }, 400);

    const normalize = (s: string) =>
      s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/\b(RUA|R|AVENIDA|AV|ALAMEDA|AL|TRAVESSA|TV|RODOVIA|ROD|PRACA|PC|ESTRADA|EST|LARGO|LG|DOUTOR|DR|PROFESSOR|PROF|PRESIDENTE|PRES|GENERAL|GEN|MARECHAL|MAL|ENGENHEIRO|ENG|SENADOR|SEN|DEPUTADO|DEP|CORONEL|CEL|CAPITAO|CAP|TENENTE|TEN|VEREADOR|VER|GOVERNADOR|GOV|PREFEITO|PREF|SANTO|STO|SANTA|STA|SAO|S|NOSSA SENHORA|NS|DOM)\b\.?\s*/g, '')
        .replace(/[^A-Z0-9]/g, '');

    // Get unmatched DB Panvel pharmacies
    const unmatched = await db.select({
      id: pharmacies.id, cnpj: pharmacies.cnpj,
      logradouro: pharmacies.logradouro, numero: pharmacies.numero,
      bairro: pharmacies.bairro, cep: pharmacies.cep,
      city: pharmacies.city, state: pharmacies.state,
      tipoLogradouro: pharmacies.tipoLogradouro,
    }).from(pharmacies)
      .where(sql`(chain_name = 'Panvel' OR UPPER(COALESCE(razao_social, '')) LIKE '%PANVEL%' OR UPPER(COALESCE(razao_social, '')) LIKE '%DIMED%') AND whatsapp_number IS NULL`);

    // Filter already-matched Panvel stores
    const matchedCnpjs = new Set(
      (await db.select({ cnpj: pharmacies.cnpj }).from(pharmacies)
        .where(sql`scrape_source IN ('panvel-website','panvel-website-ai') AND whatsapp_number IS NOT NULL`))
        .map(r => r.cnpj?.replace(/\D/g, ''))
    );
    const unmatchedStores = stores.filter(s => s.cellPhone && !matchedCnpjs.has(s.cnpj));

    // Group by city+state
    const dbByCity: Record<string, typeof unmatched> = {};
    for (const p of unmatched) { const k = `${p.city?.toUpperCase()}|${p.state}`; (dbByCity[k] ??= []).push(p); }
    const storesByCity: Record<string, PanvelStore[]> = {};
    for (const s of unmatchedStores) { const k = `${s.city.toUpperCase()}|${s.state}`; (storesByCity[k] ??= []).push(s); }

    let deterministicMatched = 0;
    let aiMatched = 0;
    const aiRemainder: { cityKey: string; dbItems: typeof unmatched; storeItems: PanvelStore[] }[] = [];

    const applyMatch = async (dbId: string, phone: string, source: string) => {
      const wa = phone.replace(/\D/g, '');
      await db.update(pharmacies).set({
        whatsappNumber: wa.startsWith('55') ? wa : `55${wa}`,
        whatsappVerified: true, lastScrapedAt: new Date(),
        scrapeSource: source, updatedAt: new Date(),
      }).where(eq(pharmacies.id, dbId));
    };

    // Phase 1: deterministic — normalized street + number
    for (const cityKey of Object.keys(dbByCity)) {
      const cityStores = storesByCity[cityKey];
      if (!cityStores?.length) continue;
      const cityDb = dbByCity[cityKey]!;

      const storeIndex = new Map<string, PanvelStore[]>();
      for (const s of cityStores) {
        const key = `${normalize(s.street)}|${String(s.number).replace(/\D/g, '')}`;
        (storeIndex.get(key) ?? (storeIndex.set(key, []), storeIndex.get(key)!)).push(s);
      }

      const remainDb: typeof unmatched = [];
      for (const p of cityDb) {
        const key = `${normalize(p.logradouro || '')}|${(p.numero || '').replace(/\D/g, '')}`;
        const matched = storeIndex.get(key);
        if (matched && matched.length === 1 && matched[0]!.cellPhone) {
          await applyMatch(p.id, matched[0]!.cellPhone!, 'panvel-website-addr');
          deterministicMatched++;
        } else {
          remainDb.push(p);
        }
      }

      if (remainDb.length > 0) {
        const remainStores = cityStores.filter(s => s.cellPhone);
        if (remainStores.length > 0) aiRemainder.push({ cityKey, dbItems: remainDb, storeItems: remainStores });
      }
    }

    // Phase 2: AI for remainder (only if apiKey provided)
    const errors: string[] = [];
    if (apiKey && aiRemainder.length > 0) {
      // Batch small cities together (max ~40 lines per prompt)
      const batches: typeof aiRemainder[] = [[]];
      let batchLines = 0;
      for (const item of aiRemainder) {
        const lines = item.dbItems.length + item.storeItems.length;
        if (batchLines + lines > 40 && batches[batches.length - 1]!.length > 0) {
          batches.push([]);
          batchLines = 0;
        }
        batches[batches.length - 1]!.push(item);
        batchLines += lines;
      }

      for (const batch of batches) {
        let prompt = 'Match Panvel pharmacy addresses. Return JSON array: [{"db":"ID","web":"ID"},...].\nOnly confident matches (same street+number). JSON only.\n\n';
        const dbMap = new Map<string, (typeof unmatched)[0]>();
        const storeMap = new Map<string, PanvelStore>();

        for (const { cityKey, dbItems, storeItems } of batch) {
          prompt += `--- ${cityKey.replace('|', ', ')} ---\n`;
          for (const p of dbItems) {
            const id = p.id.slice(0, 8);
            dbMap.set(id, p);
            prompt += `DB:${id} ${[p.tipoLogradouro, p.logradouro].filter(Boolean).join(' ')}, ${p.numero || 'S/N'}\n`;
          }
          for (const s of storeItems) {
            const id = String(s.id);
            storeMap.set(id, s);
            prompt += `WEB:${id} ${s.street}, ${s.number || 'S/N'}\n`;
          }
        }

        try {
          const resp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1024, temperature: 0, messages: [{ role: 'user', content: prompt }] }),
          });
          const result = await resp.json() as { content?: { text?: string }[] };
          const text = result.content?.[0]?.text || '[]';
          const jsonMatch = text.match(/\[[\s\S]*\]/);
          if (!jsonMatch) continue;
          const matches: { db: string; web: string }[] = JSON.parse(jsonMatch[0]);

          for (const m of matches) {
            const dbP = dbMap.get(m.db);
            const store = storeMap.get(m.web);
            if (!dbP || !store?.cellPhone) continue;
            await applyMatch(dbP.id, store.cellPhone, 'panvel-website-ai');
            aiMatched++;
          }
        } catch (err) {
          errors.push(err instanceof Error ? err.message : String(err));
        }
      }
    }

    return c.json({
      unmatchedDb: unmatched.length,
      unmatchedStores: unmatchedStores.length,
      deterministicMatched,
      aiMatched,
      aiCitiesRemaining: aiRemainder.length,
      aiBatches: apiKey ? Math.ceil(aiRemainder.length / 5) : 0,
      errors: errors.length > 0 ? errors : undefined,
    });
  });

  // Import DPSP (Drogarias Pacheco) WhatsApp numbers
  app.post('/import-dpsp', async (c) => {
    type DpspStore = {
      id: number;
      codigo: string;
      nome: string;
      whatsapp: string | null;
      telefone: string | null;
      endereco: string | null;
      numero: string | null;
      bairro: string | null;
      cidade: string;
      uf: string;
      cep: string;
    };

    const { stores } = await c.req.json() as { stores: DpspStore[] };
    if (!Array.isArray(stores)) return c.json({ error: 'stores array required' }, 400);

    const formatPhone = (raw: string): string => {
      const digits = raw.replace(/\D/g, '');
      return digits.startsWith('55') ? digits : `55${digits}`;
    };

    let matched = 0;
    let updated = 0;
    let noPhone = 0;
    let alreadyHad = 0;

    for (const store of stores) {
      if (!store.whatsapp) { noPhone++; continue; }

      const whatsappNumber = formatPhone(store.whatsapp);
      const normalizedCep = store.cep.replace(/\D/g, '');

      // Match by CEP + chain name
      const matchedIds = await db.select({ id: pharmacies.id, whatsappNumber: pharmacies.whatsappNumber })
        .from(pharmacies)
        .where(and(
          sql`REPLACE(${pharmacies.cep}, '-', '') = ${normalizedCep}`,
          sql`(${pharmacies.chainName} = 'DPSP (Pacheco/São Paulo)' OR UPPER(COALESCE(${pharmacies.razaoSocial}, '')) LIKE '%PACHECO%' OR UPPER(COALESCE(${pharmacies.razaoSocial}, '')) LIKE '%DPSP%')`,
        ))
        .limit(5);

      if (matchedIds.length > 0) {
        matched += matchedIds.length;
        for (const row of matchedIds) {
          if (row.whatsappNumber) { alreadyHad++; continue; }
          await db.update(pharmacies).set({
            whatsappNumber,
            whatsappVerified: true,
            lastScrapedAt: new Date(),
            scrapeSource: 'dpsp-website',
            updatedAt: new Date(),
          }).where(eq(pharmacies.id, row.id));
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
      alreadyHad,
    });
  });

  return app;
}

function count() {
  return sql<number>`count(*)`;
}
