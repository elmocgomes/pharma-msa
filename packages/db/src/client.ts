import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as waSessions from './schema/wa-sessions.js';
import * as pharmaciesSchema from './schema/pharmacies.js';
import * as productsSchema from './schema/products.js';
import * as scriptsSchema from './schema/scripts.js';
import * as campaignsSchema from './schema/campaigns.js';
import * as conversationsSchema from './schema/conversations.js';
import * as messagesSchema from './schema/messages.js';
import * as extractionsSchema from './schema/extractions.js';
import * as eventsSchema from './schema/events.js';

const schema = {
  ...waSessions,
  ...pharmaciesSchema,
  ...productsSchema,
  ...scriptsSchema,
  ...campaignsSchema,
  ...conversationsSchema,
  ...messagesSchema,
  ...extractionsSchema,
  ...eventsSchema,
};

export function createDb(connectionString: string) {
  const sql = postgres(connectionString, { max: 10 });
  return drizzle(sql, { schema });
}

export type Db = ReturnType<typeof createDb>;
