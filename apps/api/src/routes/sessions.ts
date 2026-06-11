import { Hono } from 'hono';
import { eq, inArray, sql } from 'drizzle-orm';
import { WhatsAppClient } from '@pharma/whatsapp';
import { waSessions, conversations, messages, conversationEvents, extractionResults, productFindings, type Db } from '@pharma/db';

export function createSessionRoutes(db: Db, waClient: WhatsAppClient) {
  const app = new Hono();

  // ── List all sessions (DB + live gateway status) ──
  app.get('/', async (c) => {
    const dbSessions = await db.select().from(waSessions);

    // Enrich with live gateway status
    let gatewaySessions: { session: string; status: string }[] = [];
    try {
      gatewaySessions = await waClient.listSessions();
    } catch (e) {
      console.warn('[SESSIONS] Failed to fetch gateway sessions:', (e as Error).message);
    }

    const gatewayMap = new Map(gatewaySessions.map((s) => [s.session, s]));

    const enriched = dbSessions.map((s) => {
      const gw = gatewayMap.get(s.name);
      return {
        ...s,
        gateway: gw
          ? { status: gw.status, synced: true }
          : { status: 'not_found', synced: false },
      };
    });

    return c.json(enriched);
  });

  // ── Get single session (DB + gateway detail) ──
  app.get('/:id', async (c) => {
    const id = c.req.param('id');
    const [session] = await db.select().from(waSessions).where(eq(waSessions.id, id));
    if (!session) return c.json({ error: 'Not found' }, 404);

    let gatewayDetail = null;
    try {
      gatewayDetail = await waClient.getSessionDetail(session.name);
    } catch {
      // Gateway session may not exist yet
    }

    return c.json({ ...session, gateway: gatewayDetail });
  });

  // ── Create a new session ──
  app.post('/', async (c) => {
    const body = await c.req.json();
    const { name, personaName, personaCpf, personaDetails, dailyLimit } = body;

    if (!name) {
      return c.json({ error: 'name is required' }, 400);
    }

    const [session] = await db
      .insert(waSessions)
      .values({
        name,
        personaName,
        personaCpf,
        personaDetails,
        dailyLimit: dailyLimit ?? 200,
      })
      .returning();

    return c.json(session, 201);
  });

  // ── Update session ──
  app.patch('/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json();
    const { name, personaName, personaCpf, personaDetails, dailyLimit, phoneNumber } = body;

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (phoneNumber !== undefined) updates.phoneNumber = phoneNumber;
    if (personaName !== undefined) updates.personaName = personaName;
    if (personaCpf !== undefined) updates.personaCpf = personaCpf;
    if (personaDetails !== undefined) updates.personaDetails = personaDetails;
    if (dailyLimit !== undefined) updates.dailyLimit = dailyLimit;

    const [updated] = await db
      .update(waSessions)
      .set(updates)
      .where(eq(waSessions.id, id))
      .returning();

    if (!updated) return c.json({ error: 'Not found' }, 404);
    return c.json(updated);
  });

  // ── Delete session (DB + gateway) ──
  app.delete('/:id', async (c) => {
    const id = c.req.param('id');
    const [session] = await db.select().from(waSessions).where(eq(waSessions.id, id));
    if (!session) return c.json({ error: 'Not found' }, 404);

    // Check for active conversations using this session
    const activeConvos = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(conversations)
      .where(
        sql`${conversations.waSessionId} = ${id} AND ${conversations.status} IN ('greeting', 'in_progress', 'waiting_response', 'recovery')`,
      );

    if (activeConvos[0]!.count > 0) {
      return c.json(
        { error: `Cannot delete: ${activeConvos[0]!.count} active conversation(s) using this session` },
        409,
      );
    }

    // Delete from gateway first
    try {
      await waClient.deleteSession(session.name);
    } catch (e) {
      console.warn(`[SESSIONS] Gateway delete failed for ${session.name}:`, (e as Error).message);
      // Continue with DB deletion even if gateway fails
    }

    // Cascade-delete all dependent data in FK order
    const sessionConvos = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.waSessionId, id));

    if (sessionConvos.length > 0) {
      const convIds = sessionConvos.map((cv) => cv.id);

      // 1. product_findings → extraction_results
      const extractions = await db
        .select({ id: extractionResults.id })
        .from(extractionResults)
        .where(inArray(extractionResults.conversationId, convIds));

      if (extractions.length > 0) {
        const extIds = extractions.map((e) => e.id);
        await db.delete(productFindings).where(inArray(productFindings.extractionResultId, extIds));
        await db.delete(extractionResults).where(inArray(extractionResults.conversationId, convIds));
      }

      // 2. conversation_events
      await db.delete(conversationEvents).where(inArray(conversationEvents.conversationId, convIds));

      // 3. messages
      await db.delete(messages).where(inArray(messages.conversationId, convIds));

      // 4. conversations
      await db.delete(conversations).where(eq(conversations.waSessionId, id));
    }

    // 5. wa_session
    await db.delete(waSessions).where(eq(waSessions.id, id));
    return c.json({ status: 'deleted', id, name: session.name });
  });

  // ── Connect session (start on gateway, get QR) ──
  app.post('/:id/connect', async (c) => {
    const id = c.req.param('id');
    const [session] = await db.select().from(waSessions).where(eq(waSessions.id, id));
    if (!session) return c.json({ error: 'Not found' }, 404);

    try {
      const result = await waClient.startSession(session.name);
      await db
        .update(waSessions)
        .set({ status: 'connecting', updatedAt: new Date() })
        .where(eq(waSessions.id, id));
      return c.json(result);
    } catch (e) {
      const msg = (e as Error).message;
      // Session may already exist on gateway
      if (msg.includes('already exist')) {
        return c.json({ message: 'Session already active on gateway' });
      }
      throw e;
    }
  });

  // ── Disconnect (logout but keep gateway session data) ──
  app.post('/:id/disconnect', async (c) => {
    const id = c.req.param('id');
    const [session] = await db.select().from(waSessions).where(eq(waSessions.id, id));
    if (!session) return c.json({ error: 'Not found' }, 404);

    try {
      await waClient.logoutSession(session.name);
    } catch (e) {
      console.warn(`[SESSIONS] Logout failed for ${session.name}:`, (e as Error).message);
    }

    await db
      .update(waSessions)
      .set({ status: 'disconnected', updatedAt: new Date() })
      .where(eq(waSessions.id, id));

    return c.json({ status: 'disconnected' });
  });

  // ── Sync status from gateway ──
  app.post('/:id/sync', async (c) => {
    const id = c.req.param('id');
    const [session] = await db.select().from(waSessions).where(eq(waSessions.id, id));
    if (!session) return c.json({ error: 'Not found' }, 404);

    try {
      const detail = await waClient.getSessionDetail(session.name);
      const newStatus = detail.connection?.isConnected ? 'connected' : 'disconnected';
      const phoneNumber = detail.details?.phoneNumber || session.phoneNumber;

      const [updated] = await db
        .update(waSessions)
        .set({
          status: newStatus,
          phoneNumber,
          updatedAt: new Date(),
        })
        .where(eq(waSessions.id, id))
        .returning();

      return c.json({ ...updated, gateway: detail });
    } catch {
      // Gateway session doesn't exist
      const [updated] = await db
        .update(waSessions)
        .set({ status: 'disconnected', updatedAt: new Date() })
        .where(eq(waSessions.id, id))
        .returning();

      return c.json({ ...updated, gateway: null });
    }
  });

  // ── Check if a phone number is on WhatsApp ──
  app.post('/:id/check-number', async (c) => {
    const id = c.req.param('id');
    const { phone } = await c.req.json();
    if (!phone) return c.json({ error: 'phone is required' }, 400);

    const [session] = await db.select().from(waSessions).where(eq(waSessions.id, id));
    if (!session) return c.json({ error: 'Not found' }, 404);

    const isRegistered = await waClient.isRegistered(session.name, phone);
    return c.json({ phone, isRegistered });
  });

  // ── Get profile of a WhatsApp number ──
  app.post('/:id/profile', async (c) => {
    const id = c.req.param('id');
    const { phone } = await c.req.json();
    if (!phone) return c.json({ error: 'phone is required' }, 400);

    const [session] = await db.select().from(waSessions).where(eq(waSessions.id, id));
    if (!session) return c.json({ error: 'Not found' }, 404);

    const jid = `${phone.replace(/\D/g, '')}@s.whatsapp.net`;
    try {
      const profile = await waClient.getProfile(session.name, jid);
      return c.json({ phone, jid, profile });
    } catch (e) {
      return c.json({ phone, jid, error: (e as Error).message }, 404);
    }
  });

  // ── Get conversation history for this session ──
  app.get('/:id/conversations', async (c) => {
    const id = c.req.param('id');
    const status = c.req.query('status'); // optional filter

    const [session] = await db.select().from(waSessions).where(eq(waSessions.id, id));
    if (!session) return c.json({ error: 'Not found' }, 404);

    let query;
    if (status) {
      query = db
        .select()
        .from(conversations)
        .where(sql`${conversations.waSessionId} = ${id} AND ${conversations.status} = ${status}`)
        .orderBy(sql`${conversations.updatedAt} DESC`);
    } else {
      query = db
        .select()
        .from(conversations)
        .where(eq(conversations.waSessionId, id))
        .orderBy(sql`${conversations.updatedAt} DESC`);
    }

    const result = await query;

    // Include message counts
    const enriched = await Promise.all(
      result.map(async (conv) => {
        const [counts] = await db
          .select({
            total: sql<number>`count(*)::int`,
            inbound: sql<number>`count(*) filter (where ${messages.direction} = 'inbound')::int`,
            outbound: sql<number>`count(*) filter (where ${messages.direction} = 'outbound')::int`,
          })
          .from(messages)
          .where(eq(messages.conversationId, conv.id));

        return {
          ...conv,
          messageCounts: counts,
        };
      }),
    );

    return c.json(enriched);
  });

  // ── Reset daily message counter ──
  app.post('/:id/reset-counter', async (c) => {
    const id = c.req.param('id');

    const [updated] = await db
      .update(waSessions)
      .set({
        dailyMessageCount: 0,
        lastResetAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(waSessions.id, id))
      .returning();

    if (!updated) return c.json({ error: 'Not found' }, 404);
    return c.json(updated);
  });

  // ── Sync all sessions from gateway ──
  app.post('/sync-all', async (c) => {
    let gatewaySessions: { session: string; status: string }[] = [];
    try {
      gatewaySessions = await waClient.listSessions();
    } catch (e) {
      return c.json({ error: `Gateway unreachable: ${(e as Error).message}` }, 502);
    }

    const dbSessions = await db.select().from(waSessions);
    const dbMap = new Map(dbSessions.map((s) => [s.name, s]));

    const results = {
      synced: [] as string[],
      orphaned: [] as string[], // in gateway but not in DB
      missing: [] as string[],  // in DB but not in gateway
    };

    for (const gw of gatewaySessions) {
      const dbSession = dbMap.get(gw.session);
      if (dbSession) {
        const newStatus = gw.status === 'connected' ? 'connected' : 'disconnected';
        if (dbSession.status !== newStatus) {
          await db
            .update(waSessions)
            .set({ status: newStatus, updatedAt: new Date() })
            .where(eq(waSessions.id, dbSession.id));
        }
        results.synced.push(gw.session);
      } else {
        results.orphaned.push(gw.session);
      }
    }

    const gwNames = new Set(gatewaySessions.map((s) => s.session));
    for (const dbSession of dbSessions) {
      if (!gwNames.has(dbSession.name) && dbSession.status !== 'disconnected') {
        await db
          .update(waSessions)
          .set({ status: 'disconnected', updatedAt: new Date() })
          .where(eq(waSessions.id, dbSession.id));
        results.missing.push(dbSession.name);
      }
    }

    return c.json(results);
  });

  return app;
}
