import { pgTable, uuid, text, integer, timestamp, jsonb } from 'drizzle-orm/pg-core';
import type { PersonaDetails } from '@pharma/shared';

export const waSessions = pgTable('wa_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  phoneNumber: text('phone_number'),
  status: text('status', { enum: ['disconnected', 'connecting', 'connected'] }).notNull().default('disconnected'),
  dailyMessageCount: integer('daily_message_count').notNull().default(0),
  dailyLimit: integer('daily_limit').notNull().default(200),
  lastResetAt: timestamp('last_reset_at', { withTimezone: true }),
  personaName: text('persona_name'),
  personaCpf: text('persona_cpf'),
  personaDetails: jsonb('persona_details').$type<PersonaDetails>(),
  state: text('state'), // Brazilian state (UF) this session operates in (e.g. 'SP', 'RJ')
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
