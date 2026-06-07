import { pgTable, uuid, text, integer, timestamp, jsonb, uniqueIndex } from 'drizzle-orm/pg-core';
import { campaigns } from './campaigns.js';
import { pharmacies } from './pharmacies.js';
import { waSessions } from './wa-sessions.js';
import { scripts } from './scripts.js';

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignId: uuid('campaign_id').notNull().references(() => campaigns.id),
  pharmacyId: uuid('pharmacy_id').notNull().references(() => pharmacies.id),
  waSessionId: uuid('wa_session_id').notNull().references(() => waSessions.id),
  scriptId: uuid('script_id').notNull().references(() => scripts.id),
  currentNodeId: text('current_node_id'),
  nodeVisitCount: integer('node_visit_count').notNull().default(0),
  status: text('status', {
    enum: ['pending', 'greeting', 'in_progress', 'waiting_response', 'recovery', 'extracting', 'completed', 'failed', 'timeout', 'error'],
  }).notNull().default('pending'),
  variables: jsonb('variables').notNull().default({}).$type<Record<string, string>>(),
  productIndex: integer('product_index').notNull().default(0),
  errorReason: text('error_reason'),
  retryCount: integer('retry_count').notNull().default(0),
  version: integer('version').notNull().default(0),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('conversation_campaign_pharmacy_unique').on(t.campaignId, t.pharmacyId),
]);
