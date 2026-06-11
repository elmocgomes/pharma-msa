import { eq } from 'drizzle-orm';
import { Queue } from 'bullmq';
import {
  type Db, scripts, conversations, waSessions,
  insertMessageIdempotent, emitEvent, campaignProducts, products,
} from '@pharma/db';
import { FlowTreeSchema, type FlowNode } from '@pharma/shared';
import { WhatsAppClient } from '@pharma/whatsapp';
import { interpolateMessage } from './message-builder.js';
import { transition } from './state-machine.js';
import type { ConnectionOptions } from 'bullmq';

const MAX_NODE_VISITS = 20;

export class ScriptRunner {
  private extractQueue: Queue;

  constructor(
    private db: Db,
    private waClient: WhatsAppClient,
    redis: ConnectionOptions,
  ) {
    this.extractQueue = new Queue('extract', { connection: redis });
  }

  async executeCurrentNode(conversationId: string, traceId: string) {
    // Always re-read to get latest version (other workers may have bumped it)
    const [conv] = await this.db.select().from(conversations).where(eq(conversations.id, conversationId));
    if (!conv) throw new Error(`Conversation ${conversationId} not found`);

    // Skip if conversation is in a terminal state
    if (['completed', 'failed', 'error'].includes(conv.status)) {
      console.log(`[SCRIPT] Skipping ${conversationId} — already in ${conv.status}`);
      return;
    }

    if (conv.nodeVisitCount >= MAX_NODE_VISITS) {
      await transition(this.db, {
        conversationId,
        expectedVersion: conv.version,
        newStatus: 'failed',
        traceId,
        updates: { errorReason: 'Max node visits exceeded (possible loop)' },
      });
      return;
    }

    const [script] = await this.db.select().from(scripts).where(eq(scripts.id, conv.scriptId));
    if (!script) throw new Error(`Script ${conv.scriptId} not found`);

    const treeResult = FlowTreeSchema.safeParse(script.tree);
    if (!treeResult.success) throw new Error(`Invalid tree in script ${script.id}`);
    const tree = treeResult.data;

    const nodeId = conv.currentNodeId ?? script.entryNodeId;
    const node = tree[nodeId];
    if (!node) {
      await transition(this.db, {
        conversationId,
        expectedVersion: conv.version,
        newStatus: 'error',
        traceId,
        updates: { errorReason: `Node "${nodeId}" not found in tree` },
      });
      return;
    }

    await emitEvent(this.db, {
      conversationId,
      eventType: `node:${node.type}`,
      eventData: { nodeId, type: node.type },
      traceId,
    });

    switch (node.type) {
      case 'send':
        await this.handleSendNode(conv, node, tree, traceId);
        break;
      case 'classify':
        await transition(this.db, {
          conversationId,
          expectedVersion: conv.version,
          newStatus: 'waiting_response',
          traceId,
          eventData: { nodeId, intent: node.intent },
        });
        break;
      case 'next_product':
        await this.handleNextProductNode(conv, node, traceId);
        break;
      case 'complete':
        await this.handleCompleteNode(conv, node, traceId);
        break;
      case 'fail':
        await transition(this.db, {
          conversationId,
          expectedVersion: conv.version,
          newStatus: 'failed',
          traceId,
          updates: { errorReason: node.reason },
        });
        break;
    }
  }

  private async handleSendNode(
    conv: typeof conversations.$inferSelect,
    node: Extract<FlowNode, { type: 'send' }>,
    tree: Record<string, FlowNode>,
    traceId: string,
  ) {
    const [session] = await this.db.select().from(waSessions).where(eq(waSessions.id, conv.waSessionId));
    if (!session) throw new Error(`WA session ${conv.waSessionId} not found`);

    const { pharmacies } = await import('@pharma/db');
    const [pharmacy] = await this.db.select().from(pharmacies).where(eq(pharmacies.id, conv.pharmacyId));
    if (!pharmacy) throw new Error(`Pharmacy ${conv.pharmacyId} not found`);

    const message = interpolateMessage(node.message, conv.variables as Record<string, string>);

    if (node.delay_ms > 0) {
      await new Promise((resolve) => setTimeout(resolve, node.delay_ms));
    }

    await this.waClient.sendText({
      session: session.name,
      to: pharmacy.phoneNumber,
      text: message,
    });

    const idempotencyKey = `out:${conv.id}:${node.id}:${Date.now()}`;
    await insertMessageIdempotent(this.db, {
      conversationId: conv.id,
      direction: 'outbound',
      content: message,
      idempotencyKey,
      nodeId: node.id,
    });

    // Re-read for latest version before transitioning
    const [freshConv] = await this.db.select().from(conversations).where(eq(conversations.id, conv.id));
    if (!freshConv) return;

    await transition(this.db, {
      conversationId: conv.id,
      expectedVersion: freshConv.version,
      newStatus: tree[node.next]?.type === 'classify' ? 'waiting_response' : 'in_progress',
      traceId,
      updates: {
        currentNodeId: node.next,
        nodeVisitCount: freshConv.nodeVisitCount + 1,
        startedAt: freshConv.startedAt ?? new Date(),
      },
      eventData: { sentMessage: message, nextNode: node.next },
    });

    if (tree[node.next]?.type !== 'classify') {
      await this.executeCurrentNode(conv.id, traceId);
    }
  }

  private async handleNextProductNode(
    conv: typeof conversations.$inferSelect,
    node: Extract<FlowNode, { type: 'next_product' }>,
    traceId: string,
  ) {
    const campaignProductList = await this.db
      .select({ product: products })
      .from(campaignProducts)
      .innerJoin(products, eq(campaignProducts.productId, products.id))
      .where(eq(campaignProducts.campaignId, conv.campaignId));

    const nextIndex = conv.productIndex + 1;
    const nextProduct = campaignProductList[nextIndex];

    // Re-read for latest version
    const [freshConv] = await this.db.select().from(conversations).where(eq(conversations.id, conv.id));
    if (!freshConv) return;

    if (nextProduct) {
      const vars = {
        ...(freshConv.variables as Record<string, string>),
        product_name: nextProduct.product.name,
        active_ingredient: nextProduct.product.activeIngredient ?? '',
        brand: nextProduct.product.brand ?? '',
        dosage: nextProduct.product.dosage ?? '',
      };

      await transition(this.db, {
        conversationId: conv.id,
        expectedVersion: freshConv.version,
        newStatus: 'in_progress',
        traceId,
        updates: {
          currentNodeId: node.has_more_next,
          productIndex: nextIndex,
          variables: vars,
          nodeVisitCount: freshConv.nodeVisitCount + 1,
        },
        eventData: { nextProductIndex: nextIndex, productName: nextProduct.product.name },
      });

      await this.executeCurrentNode(conv.id, traceId);
    } else {
      await transition(this.db, {
        conversationId: conv.id,
        expectedVersion: freshConv.version,
        newStatus: 'in_progress',
        traceId,
        updates: {
          currentNodeId: node.done_next,
          nodeVisitCount: freshConv.nodeVisitCount + 1,
        },
        eventData: { allProductsDone: true },
      });

      await this.executeCurrentNode(conv.id, traceId);
    }
  }

  private async handleCompleteNode(
    conv: typeof conversations.$inferSelect,
    node: Extract<FlowNode, { type: 'complete' }>,
    traceId: string,
  ) {
    if (node.message) {
      const [session] = await this.db.select().from(waSessions).where(eq(waSessions.id, conv.waSessionId));
      const { pharmacies } = await import('@pharma/db');
      const [pharmacy] = await this.db.select().from(pharmacies).where(eq(pharmacies.id, conv.pharmacyId));

      if (session && pharmacy) {
        const message = interpolateMessage(node.message, conv.variables as Record<string, string>);
        await this.waClient.sendText({ session: session.name, to: pharmacy.phoneNumber, text: message });

        const idempotencyKey = `out:${conv.id}:${node.id}:${Date.now()}`;
        await insertMessageIdempotent(this.db, {
          conversationId: conv.id,
          direction: 'outbound',
          content: message,
          idempotencyKey,
          nodeId: node.id,
        });
      }
    }

    // Re-read for latest version
    const [freshConv] = await this.db.select().from(conversations).where(eq(conversations.id, conv.id));
    if (!freshConv) return;

    await transition(this.db, {
      conversationId: conv.id,
      expectedVersion: freshConv.version,
      newStatus: 'extracting',
      traceId,
      updates: { completedAt: new Date() },
    });

    await this.extractQueue.add('extract', {
      conversationId: conv.id,
      traceId,
    });
  }
}
