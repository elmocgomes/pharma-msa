import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { createDb } from '@pharma/db';
import { WhatsAppClient } from '@pharma/whatsapp';
import { healthRoutes } from './routes/health.js';
import { createWebhookRoutes } from './routes/webhooks.js';
import { createSessionRoutes } from './routes/sessions.js';
import { createPharmacyRoutes } from './routes/pharmacies.js';
import { createProductRoutes } from './routes/products.js';
import { createScriptRoutes } from './routes/scripts.js';
import { createCampaignRoutes } from './routes/campaigns.js';
import { createConversationRoutes } from './routes/conversations.js';
import { createResultRoutes } from './routes/results.js';
import { errorHandler } from './middleware/error-handler.js';

const db = createDb(process.env.DATABASE_URL!);
const redisUrl = new URL(process.env.REDIS_URL!);
const redisConnection = {
  host: redisUrl.hostname,
  port: parseInt(redisUrl.port || '6379', 10),
  family: 4, // Force IPv4 — fixes EAI_AGAIN on Alpine/musl + Docker DNS
  ...(redisUrl.password && { password: decodeURIComponent(redisUrl.password) }),
  ...(redisUrl.username && redisUrl.username !== 'default' && { username: redisUrl.username }),
};
const waClient = new WhatsAppClient(
  process.env.WA_GATEWAY_URL!,
  process.env.WA_GATEWAY_KEY!,
);

const app = new Hono();

app.use('*', cors());
app.use('*', logger());
app.onError(errorHandler);

app.route('/health', healthRoutes);
app.route('/webhooks/whatsapp', createWebhookRoutes(db, redisConnection));
app.route('/sessions', createSessionRoutes(db, waClient));
app.route('/pharmacies', createPharmacyRoutes(db));
app.route('/products', createProductRoutes(db));
app.route('/scripts', createScriptRoutes(db));
app.route('/campaigns', createCampaignRoutes(db, redisConnection));
app.route('/conversations', createConversationRoutes(db));
app.route('/results', createResultRoutes(db));

const port = parseInt(process.env.PORT ?? '3000', 10);

serve({ fetch: app.fetch, port }, () => {
  console.log(`[API] Pharma MSA API running on port ${port}`);
});
