import { pgTable, uuid, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { campaigns } from './campaigns.js';
import type { CampaignReport } from '@pharma/shared';

export const campaignReports = pgTable('campaign_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignId: uuid('campaign_id').notNull().references(() => campaigns.id),
  report: jsonb('report').notNull().$type<CampaignReport>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
