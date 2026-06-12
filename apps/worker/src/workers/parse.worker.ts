import { Worker, Queue, type ConnectionOptions } from 'bullmq';
import { eq } from 'drizzle-orm';
import {
  type Db, conversations, messages, scripts, waSessions,
  insertMessageIdempotent, getRecentMessages,
} from '@pharma/db';
import { FlowTreeSchema, type ClassifyNode } from '@pharma/shared';
import { RecoveryAgent, type LlmProvider, type LlmMessage, NavigatorAgent } from '@pharma/ai';
import { WhatsAppClient } from '@pharma/whatsapp';
import { transition } from '../engine/state-machine.js';
import { TieredClassifier } from '../engine/classifier.js';
import type { ParseJobData } from '../queues/definitions.js';

export function createParseWorker(
  db: Db,
  waClient: WhatsAppClient,
  navigatorProvider: LlmProvider,
  recoveryProvider: LlmProvider,
  redis: ConnectionOptions,
) {
  const conversationQueue = new Queue('conversation', { connection: redis });
  const navigator = new NavigatorAgent(navigatorProvider);
  const recovery = new RecoveryAgent(recoveryProvider);
  const classifier = new TieredClassifier(navigator);

  return new Worker<ParseJobData>(
    'parse',
    async (job) => {
      const { conversationId, messageId, traceId } = job.data;

      const [conv] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
      if (!conv) return;
      if (conv.status !== 'waiting_response' && conv.status !== 'recovery') {
        console.warn(`[PARSE] Conversation ${conversationId} in unexpected status: ${conv.status}`);
        return;
      }

      const [msg] = await db.select().from(messages).where(eq(messages.id, messageId));
      if (!msg) return;

      const [script] = await db.select().from(scripts).where(eq(scripts.id, conv.scriptId));
      if (!script) return;

      const treeResult = FlowTreeSchema.safeParse(script.tree);
      if (!treeResult.success) {
        await transition(db, {
          conversationId,
          expectedVersion: conv.version,
          newStatus: 'error',
          traceId,
          updates: { errorReason: 'Invalid script tree' },
        });
        return;
      }

      const tree = treeResult.data;
      const nodeId = conv.currentNodeId;
      if (!nodeId) return;

      const node = tree[nodeId];
      if (!node || node.type !== 'classify') {
        console.warn(`[PARSE] Expected classify node, got ${node?.type} at ${nodeId}`);
        return;
      }

      const classifyNode = node as ClassifyNode;

      await transition(db, {
        conversationId,
        expectedVersion: conv.version,
        newStatus: 'in_progress',
        traceId,
      });

      const recentMessages = await getRecentMessages(db, conversationId, 6);
      const history: LlmMessage[] = recentMessages.map((m) => ({
        role: m.direction === 'outbound' ? 'assistant' as const : 'user' as const,
        content: m.content,
      }));

      // Build persona from session
      const [session] = await db.select().from(waSessions).where(eq(waSessions.id, conv.waSessionId));
      const persona = {
        name: session?.personaName ?? 'Cliente',
        cpf: session?.personaCpf ?? undefined,
        neighborhood: (session?.personaDetails as Record<string, unknown>)?.neighborhood as string | undefined,
        age: (session?.personaDetails as Record<string, unknown>)?.age as number | undefined,
        backstory: (session?.personaDetails as Record<string, unknown>)?.backstory as string | undefined,
      };

      try {
        const result = await classifier.classify({
          message: msg.content,
          node: classifyNode,
          conversationHistory: history,
          persona,
        });

        console.log(`[PARSE] ${conversationId} classified as tier=${result.tier} category=${result.category} confidence=${result.confidence}`);

        // ── Handle personal question (Tier 0) ──
        if (result.tier === 'personal' && result.personalResponse) {
          await handlePersonalResponse(db, waClient, conv, result.personalResponse, traceId);
          return;
        }

        // ── Handle recovery needed (Tier 3) ──
        if (result.tier === 'recovery') {
          await handleRecovery(db, waClient, recovery, conv, classifyNode, msg.content, history, traceId);
          return;
        }

        // ── Handle successful classification (Tier 1 or 2) ──
        const branch = classifyNode.branches.find((b) => b.category === result.category);
        if (!branch) {
          await handleRecovery(db, waClient, recovery, conv, classifyNode, msg.content, history, traceId);
          return;
        }

        const [latest] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
        if (!latest) return;

        await db.update(conversations).set({
          currentNodeId: branch.next,
          nodeVisitCount: latest.nodeVisitCount + 1,
          retryCount: 0,
          version: latest.version + 1,
          updatedAt: new Date(),
        }).where(eq(conversations.id, conversationId));

        await conversationQueue.add('continue', {
          conversationId,
          traceId,
        });

      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[PARSE] Classification error for ${conversationId}:`, message);

        const [latest] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
        if (latest) {
          await transition(db, {
            conversationId,
            expectedVersion: latest.version,
            newStatus: 'error',
            traceId,
            updates: { errorReason: `Classification failed: ${message}` },
          });
        }
      }
    },
    { connection: redis, concurrency: 10 },
  );
}

/**
 * Handle personal question: send preset response, stay in waiting_response.
 * Zero AI cost.
 */
async function handlePersonalResponse(
  db: Db,
  waClient: WhatsAppClient,
  conv: typeof conversations.$inferSelect,
  responseText: string,
  traceId: string,
) {
  const [session] = await db.select().from(waSessions).where(eq(waSessions.id, conv.waSessionId));
  if (!session) return;

  const { pharmacies } = await import('@pharma/db');
  const [pharmacy] = await db.select().from(pharmacies).where(eq(pharmacies.id, conv.pharmacyId));
  if (!pharmacy) return;

  // Natural delay
  await new Promise((resolve) => setTimeout(resolve, 1500 + Math.random() * 3000));

  await waClient.sendText({
    session: session.name,
    to: pharmacy.phoneNumber,
    text: responseText,
  });

  const idempotencyKey = `out:${conv.id}:personal:${Date.now()}`;
  await insertMessageIdempotent(db, {
    conversationId: conv.id,
    direction: 'outbound',
    content: responseText,
    idempotencyKey,
    nodeId: conv.currentNodeId ?? undefined,
  });

  const [latest] = await db.select().from(conversations).where(eq(conversations.id, conv.id));
  if (latest) {
    await transition(db, {
      conversationId: conv.id,
      expectedVersion: latest.version,
      newStatus: 'waiting_response',
      traceId,
      eventData: { personalResponse: responseText },
    });
  }
}

async function handleRecovery(
  db: Db,
  waClient: WhatsAppClient,
  recovery: RecoveryAgent,
  conv: typeof conversations.$inferSelect,
  classifyNode: ClassifyNode,
  pharmacyMessage: string,
  history: LlmMessage[],
  traceId: string,
) {
  const maxRetries = classifyNode.max_retries;
  if (conv.retryCount >= maxRetries) {
    const [latest] = await db.select().from(conversations).where(eq(conversations.id, conv.id));
    if (latest) {
      await transition(db, {
        conversationId: conv.id,
        expectedVersion: latest.version,
        newStatus: 'failed',
        traceId,
        updates: { errorReason: `Max recovery retries (${maxRetries}) exceeded` },
      });
    }
    return;
  }

  const [session] = await db.select().from(waSessions).where(eq(waSessions.id, conv.waSessionId));
  if (!session) return;

  const { pharmacies } = await import('@pharma/db');
  const [pharmacy] = await db.select().from(pharmacies).where(eq(pharmacies.id, conv.pharmacyId));
  if (!pharmacy) return;

  try {
    const result = await recovery.recover({
      pharmacyMessage,
      conversationHistory: history,
      currentIntent: classifyNode.intent,
      persona: {
        name: session.personaName ?? 'Cliente',
        cpf: session.personaCpf ?? undefined,
        details: (session.personaDetails as Record<string, unknown>) ?? undefined,
      },
    });

    if (!result.should_retry) {
      const [latest] = await db.select().from(conversations).where(eq(conversations.id, conv.id));
      if (latest) {
        await transition(db, {
          conversationId: conv.id,
          expectedVersion: latest.version,
          newStatus: 'failed',
          traceId,
          updates: { errorReason: 'Pharmacy uncooperative (recovery agent gave up)' },
        });
      }
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 2000 + Math.random() * 5000));

    await waClient.sendText({
      session: session.name,
      to: pharmacy.phoneNumber,
      text: result.message,
    });

    const idempotencyKey = `out:${conv.id}:recovery:${Date.now()}`;
    await insertMessageIdempotent(db, {
      conversationId: conv.id,
      direction: 'outbound',
      content: result.message,
      idempotencyKey,
      nodeId: conv.currentNodeId ?? undefined,
    });

    const [latest] = await db.select().from(conversations).where(eq(conversations.id, conv.id));
    if (latest) {
      await transition(db, {
        conversationId: conv.id,
        expectedVersion: latest.version,
        newStatus: 'waiting_response',
        traceId,
        updates: { retryCount: conv.retryCount + 1 },
        eventData: { recoveryMessage: result.message, retryCount: conv.retryCount + 1 },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[PARSE] Recovery error for ${conv.id}:`, message);
    const [latest] = await db.select().from(conversations).where(eq(conversations.id, conv.id));
    if (latest) {
      await transition(db, {
        conversationId: conv.id,
        expectedVersion: latest.version,
        newStatus: 'error',
        traceId,
        updates: { errorReason: `Recovery failed: ${message}` },
      });
    }
  }
}
