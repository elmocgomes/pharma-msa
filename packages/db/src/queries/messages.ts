import { eq, sql } from 'drizzle-orm';
import { createHash } from 'crypto';
import type { Db } from '../client.js';
import { messages } from '../schema/messages.js';

export function computeIdempotencyKey(
  sessionId: string,
  sender: string,
  timestamp: string,
  content: string,
): string {
  return createHash('sha256')
    .update(`${sessionId}:${sender}:${timestamp}:${content}`)
    .digest('hex');
}

export async function insertMessageIdempotent(
  db: Db,
  data: {
    conversationId: string;
    direction: 'inbound' | 'outbound';
    content: string;
    mediaUrl?: string;
    waMessageId?: string;
    idempotencyKey: string;
    nodeId?: string;
  },
) {
  const result = await db
    .insert(messages)
    .values(data)
    .onConflictDoNothing({ target: messages.idempotencyKey })
    .returning();

  return result[0] ?? null;
}

export async function getConversationMessages(
  db: Db,
  conversationId: string,
  limit = 50,
) {
  return db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt)
    .limit(limit);
}

export async function getRecentMessages(
  db: Db,
  conversationId: string,
  count = 6,
) {
  const result = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(sql`${messages.createdAt} DESC`)
    .limit(count);

  return result.reverse();
}
