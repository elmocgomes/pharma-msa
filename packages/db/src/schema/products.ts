import { pgTable, uuid, text, integer, timestamp } from 'drizzle-orm/pg-core';
import { anvisaProducts } from './anvisa.js';

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  activeIngredient: text('active_ingredient'),
  category: text('category'),
  brand: text('brand'),
  dosage: text('dosage'),
  quantity: integer('quantity'),
  form: text('form'),
  productType: text('product_type', {
    enum: ['reference', 'similar', 'generic'],
  }).notNull().default('reference'),
  referenceProductId: uuid('reference_product_id'),  // self-ref, no FK constraint in Drizzle to avoid circular
  anvisaProductId: uuid('anvisa_product_id').references(() => anvisaProducts.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
