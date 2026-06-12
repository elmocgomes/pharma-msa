import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { scripts } from './scripts.js';
import type { CampaignSettings } from '@pharma/shared';

export const campaignGroups = pgTable('campaign_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  scriptId: uuid('script_id').notNull().references(() => scripts.id),
  productIds: jsonb('product_ids').notNull().$type<string[]>(),
  targetStates: jsonb('target_states').notNull().$type<string[]>(),
  settings: jsonb('settings').notNull().$type<CampaignSettings>(),
  status: text('status', { enum: ['draft', 'running', 'paused', 'completed'] }).notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
