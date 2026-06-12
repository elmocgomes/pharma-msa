import { pgTable, uuid, text, integer, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const agentPrompts = pgTable('agent_prompts', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentName: text('agent_name').notNull(),
  promptType: text('prompt_type').notNull(),
  content: text('content').notNull(),
  version: integer('version').notNull().default(1),
  isActive: boolean('is_active').notNull().default(true),
  metadata: jsonb('metadata').$type<{
    description?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    lastEditedBy?: string;
    notes?: string;
  }>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const promptVersions = pgTable('prompt_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  promptId: uuid('prompt_id').notNull().references(() => agentPrompts.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  content: text('content').notNull(),
  changedBy: text('changed_by'),
  changeReason: text('change_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
