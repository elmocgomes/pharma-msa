import { Worker, type ConnectionOptions } from 'bullmq';
import type { Db } from '@pharma/db';
import { WhatsAppClient } from '@pharma/whatsapp';
import { ScriptRunner } from '../engine/script-runner.js';
import { transition } from '../engine/state-machine.js';
import { eq } from 'drizzle-orm';
import { conversations } from '@pharma/db';
import type { ConversationJobData } from '../queues/definitions.js';

export function createConversationWorker(db: Db, waClient: WhatsAppClient, redis: ConnectionOptions) {
  const runner = new ScriptRunner(db, waClient, redis);

  return new Worker<ConversationJobData>(
    'conversation',
    async (job) => {
      const { conversationId, traceId } = job.data;

      const [conv] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
      if (!conv) {
        console.error(`[CONVERSATION] Conversation ${conversationId} not found`);
        return;
      }

      if (conv.status === 'completed' || conv.status === 'failed' || conv.status === 'error') {
        console.log(`[CONVERSATION] Conversation ${conversationId} already in terminal state: ${conv.status}`);
        return;
      }

      try {
        if (conv.status === 'pending') {
          await transition(db, {
            conversationId,
            expectedVersion: conv.version,
            newStatus: 'greeting',
            traceId,
          });
          const updated = await db.select().from(conversations).where(eq(conversations.id, conversationId));
          if (updated[0]) {
            await runner.executeCurrentNode(conversationId, traceId);
          }
        } else {
          await runner.executeCurrentNode(conversationId, traceId);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[CONVERSATION] Error in ${conversationId}:`, message);

        if (!message.includes('Optimistic lock failed')) {
          try {
            const [latest] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
            if (latest && latest.status !== 'error' && latest.status !== 'completed' && latest.status !== 'failed') {
              await transition(db, {
                conversationId,
                expectedVersion: latest.version,
                newStatus: 'error',
                traceId,
                updates: { errorReason: message },
              });
            }
          } catch {
            console.error(`[CONVERSATION] Failed to mark ${conversationId} as error`);
          }
        }
      }
    },
    {
      connection: redis,
      concurrency: 5,
      limiter: { max: 10, duration: 60_000 },
    },
  );
}
