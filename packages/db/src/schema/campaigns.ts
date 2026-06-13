import { pgTable, uuid, text, timestamp, jsonb, uniqueIndex } from 'drizzle-orm/pg-core';
import { scripts } from './scripts.js';
import { waSessions } from './wa-sessions.js';
import { pharmacies } from './pharmacies.js';
import { products } from './products.js';
import { campaignGroups } from './campaign-groups.js';
import type { CampaignSettings } from '@pharma/shared';

export const campaigns = pgTable('campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  scriptId: uuid('script_id').notNull().references(() => scripts.id),
  waSessionId: uuid('wa_session_id').notNull().references(() => waSessions.id),
  campaignGroupId: uuid('campaign_group_id').references(() => campaignGroups.id, { onDelete: 'set null' }),
  targetState: text('target_state'), // Brazilian state (UF) this campaign targets
  status: text('status', { enum: ['draft', 'running', 'paused', 'completed'] }).notNull().default('draft'),
  settings: jsonb('settings').notNull().$type<CampaignSettings>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const campaignPharmacies = pgTable('campaign_pharmacies', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignId: uuid('campaign_id').notNull().references(() => campaigns.id),
  pharmacyId: uuid('pharmacy_id').notNull().references(() => pharmacies.id),
  status: text('status', { enum: ['pending', 'in_progress', 'completed', 'failed', 'skipped'] }).notNull().default('pending'),
}, (t) => [
  uniqueIndex('campaign_pharmacy_unique').on(t.campaignId, t.pharmacyId),
]);

export const campaignProducts = pgTable('campaign_products', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignId: uuid('campaign_id').notNull().references(() => campaigns.id),
  productId: uuid('product_id').notNull().references(() => products.id),
  role: text('role', { enum: ['survey', 'competitor'] }).notNull().default('survey'),
}, (t) => [
  uniqueIndex('campaign_product_unique').on(t.campaignId, t.productId),
]);
