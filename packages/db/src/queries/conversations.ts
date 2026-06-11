import { eq, and, sql } from 'drizzle-orm';
import type { Db } from '../client.js';
import { conversations } from '../schema/conversations.js';
import { assertValidTransition, type ConversationStatus } from '@pharma/shared';

export async function transitionConversation(
  db: Db,
  conversationId: string,
  expectedVersion: number,
  newStatus: ConversationStatus,
  updates: Partial<{
    currentNodeId: string | null;
    nodeVisitCount: number;
    productIndex: number;
    variables: Record<string, string>;
    errorReason: string | null;
    retryCount: number;
    startedAt: Date;
    completedAt: Date;
  }> = {},
) {
  const current = await db
    .select({ status: conversations.status })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  if (current.length === 0) {
    throw new Error(`Conversation ${conversationId} not found`);
  }

  assertValidTransition(current[0]!.status as ConversationStatus, newStatus);

  const result = await db
    .update(conversations)
    .set({
      status: newStatus,
      version: sql`${conversations.version} + 1`,
      updatedAt: new Date(),
      ...updates,
    })
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.version, expectedVersion),
      ),
    )
    .returning();

  if (result.length === 0) {
    throw new Error(`Optimistic lock failed for conversation ${conversationId} (expected version ${expectedVersion})`);
  }

  return result[0]!;
}

export async function findActiveConversation(
  db: Db,
  waSessionId: string,
  senderPhone: string,
) {
  const { pharmacies } = await import('../schema/pharmacies.js');

  const result = await db
    .select({
      conversation: conversations,
    })
    .from(conversations)
    .innerJoin(pharmacies, eq(conversations.pharmacyId, pharmacies.id))
    .where(
      and(
        eq(conversations.waSessionId, waSessionId),
        sql`regexp_replace(${pharmacies.phoneNumber}, '\\D', '', 'g') = ${senderPhone}`,
        sql`${conversations.status} IN ('greeting', 'in_progress', 'waiting_response', 'recovery', 'timeout')`,
      ),
    )
    .limit(1);

  return result[0]?.conversation ?? null;
}

/**
 * Find active conversation by session only (fallback for @lid JIDs
 * where we can't extract the phone number).
 * Returns the most recent waiting_response conversation for this session.
 */
export async function findActiveConversationBySession(
  db: Db,
  waSessionId: string,
) {
  const result = await db
    .select({
      conversation: conversations,
    })
    .from(conversations)
    .where(
      and(
        eq(conversations.waSessionId, waSessionId),
        sql`${conversations.status} IN ('greeting', 'in_progress', 'waiting_response', 'recovery', 'timeout')`,
      ),
    )
    .orderBy(sql`${conversations.updatedAt} DESC`)
    .limit(1);

  return result[0]?.conversation ?? null;
}
