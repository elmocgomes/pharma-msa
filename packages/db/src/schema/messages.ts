import { pgTable, uuid, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { conversations } from './conversations.js';

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id),
  direction: text('direction', { enum: ['inbound', 'outbound'] }).notNull(),
  content: text('content').notNull(),
  mediaUrl: text('media_url'),
  waMessageId: text('wa_message_id'),
  idempotencyKey: text('idempotency_key').notNull(),
  nodeId: text('node_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('message_idempotency_unique').on(t.idempotencyKey),
]);
