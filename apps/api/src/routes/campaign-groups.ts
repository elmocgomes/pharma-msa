import { Hono } from 'hono';
import { eq, inArray } from 'drizzle-orm';
import {
  campaignGroups, campaigns, campaignPharmacies, campaignProducts,
  waSessions, pharmacies, products, anvisaProducts, type Db,
} from '@pharma/db';
import type { CampaignSettings } from '@pharma/shared';

export function createCampaignGroupRoutes(db: Db) {
  const app = new Hono();

  // ── List campaign groups ──
  app.get('/', async (c) => {
    const groups = await db.select().from(campaignGroups).orderBy(campaignGroups.createdAt);
    return c.json(groups);
  });

  // ── Get single group with its child campaigns ──
  app.get('/:id', async (c) => {
    const id = c.req.param('id');
    const [group] = await db.select().from(campaignGroups).where(eq(campaignGroups.id, id));
    if (!group) return c.json({ error: 'Not found' }, 404);

    const childCampaigns = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.campaignGroupId, id));

    return c.json({ ...group, campaigns: childCampaigns });
  });

  // ── Create campaign group and auto-create per-state campaigns ──
  app.post('/', async (c) => {
    const body = await c.req.json<{
      name: string;
      scriptId: string;
      productIds?: string[];
      anvisaProductIds?: string[];
      targetStates: string[];
      settings?: CampaignSettings;
    }>();

    const hasProducts = (body.productIds?.length ?? 0) > 0 || (body.anvisaProductIds?.length ?? 0) > 0;
    if (!body.name || !body.scriptId || !hasProducts || !body.targetStates?.length) {
      return c.json({ error: 'name, scriptId, products (productIds or anvisaProductIds), and targetStates are required' }, 400);
    }

    // Resolve Anvisa product IDs to products table IDs
    const resolvedProductIds: string[] = [...(body.productIds ?? [])];
    if (body.anvisaProductIds?.length) {
      const anvisaRows = await db
        .select()
        .from(anvisaProducts)
        .where(inArray(anvisaProducts.id, body.anvisaProductIds));

      const typeMap: Record<string, 'reference' | 'similar' | 'generic'> = {
        'Novo': 'reference',
        'Similar': 'similar',
        'Genérico': 'generic',
      };

      for (const anvisa of anvisaRows) {
        const [existing] = await db
          .select({ id: products.id })
          .from(products)
          .where(eq(products.anvisaProductId, anvisa.id))
          .limit(1);

        if (existing) {
          resolvedProductIds.push(existing.id);
        } else {
          const [newProduct] = await db.insert(products).values({
            name: anvisa.produto,
            activeIngredient: anvisa.substancia,
            brand: anvisa.laboratorio,
            dosage: anvisa.apresentacao,
            productType: typeMap[anvisa.tipoProduto] ?? 'reference' as const,
            anvisaProductId: anvisa.id,
          }).returning();
          if (newProduct) resolvedProductIds.push(newProduct.id);
        }
      }
    }

    // Find sessions for each target state
    const sessions = await db
      .select()
      .from(waSessions)
      .where(inArray(waSessions.state, body.targetStates));

    const sessionByState = new Map(sessions.map((s) => [s.state!, s]));

    // Check which states have a session
    const missingStates = body.targetStates.filter((st) => !sessionByState.has(st));
    if (missingStates.length > 0) {
      return c.json({
        error: `No WhatsApp session assigned to states: ${missingStates.join(', ')}. Assign sessions to states first.`,
      }, 400);
    }

    // Find pharmacies per state
    const allPharmacies = await db
      .select()
      .from(pharmacies)
      .where(inArray(pharmacies.state, body.targetStates));

    const pharmaciesByState = new Map<string, typeof allPharmacies>();
    for (const ph of allPharmacies) {
      if (!ph.state) continue;
      const list = pharmaciesByState.get(ph.state) ?? [];
      list.push(ph);
      pharmaciesByState.set(ph.state, list);
    }

    const statesWithNoPharmacies = body.targetStates.filter((st) => !pharmaciesByState.has(st) || pharmaciesByState.get(st)!.length === 0);
    if (statesWithNoPharmacies.length > 0) {
      return c.json({
        error: `No pharmacies found in states: ${statesWithNoPharmacies.join(', ')}. Add pharmacies with state set first.`,
      }, 400);
    }

    const defaultSettings: CampaignSettings = body.settings ?? {
      concurrent_limit: 3,
      delay_range_ms: [5000, 15000],
      business_hours: { start: 8, end: 18 },
      rate_limit_per_hour: 20,
    };

    // Create the campaign group
    const [group] = await db
      .insert(campaignGroups)
      .values({
        name: body.name,
        scriptId: body.scriptId,
        productIds: resolvedProductIds,
        targetStates: body.targetStates,
        settings: defaultSettings,
      })
      .returning();

    // Create one child campaign per state
    const childCampaigns = [];
    for (const state of body.targetStates) {
      const session = sessionByState.get(state)!;
      const statePharmacies = pharmaciesByState.get(state) ?? [];

      // Create campaign
      const [campaign] = await db
        .insert(campaigns)
        .values({
          name: `${body.name} — ${state}`,
          scriptId: body.scriptId,
          waSessionId: session.id,
          campaignGroupId: group!.id,
          targetState: state,
          settings: defaultSettings,
        })
        .returning();

      // Link pharmacies
      if (statePharmacies.length > 0) {
        await db.insert(campaignPharmacies).values(
          statePharmacies.map((ph) => ({
            campaignId: campaign!.id,
            pharmacyId: ph.id,
          })),
        );
      }

      // Link products
      if (resolvedProductIds.length > 0) {
        await db.insert(campaignProducts).values(
          resolvedProductIds.map((pid) => ({
            campaignId: campaign!.id,
            productId: pid,
          })),
        );
      }

      childCampaigns.push({
        ...campaign,
        state,
        pharmacyCount: statePharmacies.length,
      });
    }

    return c.json({
      group,
      campaigns: childCampaigns,
    }, 201);
  });

  return app;
}
