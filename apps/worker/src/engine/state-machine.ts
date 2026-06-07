import { transitionConversation, emitEvent, type Db } from '@pharma/db';
import type { ConversationStatus } from '@pharma/shared';

export async function transition(
  db: Db,
  opts: {
    conversationId: string;
    expectedVersion: number;
    newStatus: ConversationStatus;
    traceId: string;
    updates?: Parameters<typeof transitionConversation>[4];
    eventData?: Record<string, unknown>;
  },
) {
  const updated = await transitionConversation(
    db,
    opts.conversationId,
    opts.expectedVersion,
    opts.newStatus,
    opts.updates,
  );

  await emitEvent(db, {
    conversationId: opts.conversationId,
    eventType: `status:${opts.newStatus}`,
    eventData: opts.eventData,
    traceId: opts.traceId,
  });

  return updated;
}
