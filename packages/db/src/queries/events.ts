import { eq, sql } from 'drizzle-orm';
import type { Db } from '../client.js';
import { conversationEvents } from '../schema/events.js';

export async function emitEvent(
  db: Db,
  data: {
    conversationId: string;
    eventType: string;
    eventData?: Record<string, unknown>;
    traceId: string;
  },
) {
  const [seqResult] = await db
    .select({
      nextSeq: sql<number>`coalesce(max(${conversationEvents.sequenceNumber}), 0) + 1`,
    })
    .from(conversationEvents)
    .where(eq(conversationEvents.conversationId, data.conversationId));

  return db.insert(conversationEvents).values({
    conversationId: data.conversationId,
    eventType: data.eventType,
    eventData: data.eventData ?? {},
    traceId: data.traceId,
    sequenceNumber: seqResult?.nextSeq ?? 1,
  }).returning();
}
