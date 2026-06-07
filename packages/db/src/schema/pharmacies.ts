import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';

export const pharmacies = pgTable('pharmacies', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  phoneNumber: text('phone_number').notNull().unique(),
  city: text('city'),
  state: text('state'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
