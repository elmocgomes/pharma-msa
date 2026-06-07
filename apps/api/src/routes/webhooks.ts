import { Hono } from 'hono';
import { Queue } from 'bullmq';
import { WaWebhookMessageSchema, WaWebhookSessionSchema } from '@pharma/whatsapp';
import { findActiveConversation, insertMessageIdempotent, computeIdempotencyKey, waSessions } from '@pharma/db';
import { normalizePhone } from '@pharma/shared';
import { eq } from 'drizzle-orm';
import type { Db } from '@pharma/db';
import type { ConnectionOptions } from 'bullmq';

export function createWebhookRoutes(db: Db, redis: ConnectionOptions) {
  const app = new Hono();
  const parseQueue = new Queue('parse', { connection: redis });

  app.post('/message', async (c) => {
    const body = await c.req.json();
    const parsed = WaWebhookMessageSchema.safeParse(body);

    if (!parsed.success) {
      console.error('[WEBHOOK] Invalid message payload:', parsed.error.message);
      return c.json({ error: 'Invalid payload' }, 400);
    }

    const { session, from, message, media } = parsed.data;
    const senderPhone = normalizePhone(from);

    const [waSession] = await db
      .select()
      .from(waSessions)
      .where(eq(waSessions.name, session))
      .limit(1);

    if (!waSession) {
      console.warn(`[WEBHOOK] Unknown session: ${session}`);
      return c.json({ status: 'ignored', reason: 'unknown_session' });
    }

    const conversation = await findActiveConversation(db, waSession.id, senderPhone);
    if (!conversation) {
      console.warn(`[WEBHOOK] No active conversation for ${senderPhone} on session ${session}`);
      return c.json({ status: 'ignored', reason: 'no_active_conversation' });
    }

    const content = message || '';
    const mediaUrl = media?.image ?? media?.video ?? media?.document ?? media?.audio ?? null;
    const idempotencyKey = computeIdempotencyKey(session, senderPhone, new Date().toISOString(), content);

    const inserted = await insertMessageIdempotent(db, {
      conversationId: conversation.id,
      direction: 'inbound',
      content,
      mediaUrl: mediaUrl ?? undefined,
      idempotencyKey,
      nodeId: conversation.currentNodeId ?? undefined,
    });

    if (!inserted) {
      return c.json({ status: 'duplicate' });
    }

    await parseQueue.add('parse', {
      conversationId: conversation.id,
      messageId: inserted.id,
      traceId: crypto.randomUUID(),
    });

    return c.json({ status: 'queued' });
  });

  app.post('/session', async (c) => {
    const body = await c.req.json();
    const parsed = WaWebhookSessionSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Invalid payload' }, 400);
    }

    const { session, status } = parsed.data;

    await db
      .update(waSessions)
      .set({
        status,
        updatedAt: new Date(),
      })
      .where(eq(waSessions.name, session));

    console.log(`[WEBHOOK] Session ${session} → ${status}`);
    return c.json({ status: 'ok' });
  });

  return app;
}
