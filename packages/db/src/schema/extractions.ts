import { pgTable, uuid, text, numeric, boolean, integer, timestamp, jsonb, uniqueIndex } from 'drizzle-orm/pg-core';
import { conversations } from './conversations.js';
import { products } from './products.js';
import type { ExtractorResult } from '@pharma/shared';

export const extractionResults = pgTable('extraction_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id),
  rawAnalysis: jsonb('raw_analysis').notNull().$type<ExtractorResult>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('extraction_conversation_unique').on(t.conversationId),
]);

export const productFindings = pgTable('product_findings', {
  id: uuid('id').primaryKey().defaultRandom(),
  extractionResultId: uuid('extraction_result_id').notNull().references(() => extractionResults.id),
  productId: uuid('product_id').references(() => products.id),
  productNameMentioned: text('product_name_mentioned').notNull(),
  isAvailable: boolean('is_available'),
  price: numeric('price', { precision: 10, scale: 2 }),
  priceUnit: text('price_unit').default('BRL'),
  hasGeneric: boolean('has_generic'),
  genericNames: text('generic_names').array(),
  genericPrices: numeric('generic_prices', { precision: 10, scale: 2 }).array(),
  alternativeNames: text('alternative_names').array(),
  notes: text('notes'),
  productType: text('product_type', {
    enum: ['reference', 'similar', 'generic'],
  }),
  laboratory: text('laboratory'),
  dosageMentioned: text('dosage_mentioned'),
  quantityMentioned: integer('quantity_mentioned'),
  formMentioned: text('form_mentioned'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
