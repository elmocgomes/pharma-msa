import { pgTable, uuid, text, integer, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { conversations } from './conversations.js';

export const conversationEvents = pgTable('conversation_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id),
  eventType: text('event_type').notNull(),
  eventData: jsonb('event_data').default({}).$type<Record<string, unknown>>(),
  traceId: uuid('trace_id').notNull(),
  sequenceNumber: integer('sequence_number').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
