import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { conversations } from './conversations.js';

export const trainingEvaluations = pgTable('training_evaluations', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  extractionResult: jsonb('extraction_result').$type<Record<string, unknown>>(),
  adminCorrections: jsonb('admin_corrections').$type<Record<string, unknown>>(),
  notes: text('notes'),
  status: text('status', { enum: ['pending', 'evaluated', 'applied'] }).notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
