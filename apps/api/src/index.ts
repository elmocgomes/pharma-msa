import dns from 'node:dns';
import { promisify } from 'node:util';
// Force IPv4-first DNS resolution
dns.setDefaultResultOrder('ipv4first');
const resolve4 = promisify(dns.resolve4);

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
import { createPromptRoutes } from './routes/prompts.js';
import { createPromptChatRoutes } from './routes/prompt-chat.js';
import { createReportRoutes } from './routes/reports.js';
import { createMigrateRoutes } from './routes/migrate.js';
import { errorHandler } from './middleware/error-handler.js';

// Resolve hostnames to IPs at startup to bypass Docker DNS for long-lived connections
async function resolveHost(hostname: string): Promise<string> {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return hostname;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const addresses = await resolve4(hostname);
      const ip = addresses[0] ?? hostname;
      console.log(`[DNS] Resolved ${hostname} → ${ip}`);
      return ip;
    } catch (err) {
      console.warn(`[DNS] Attempt ${attempt + 1}/5 failed for ${hostname}:`, (err as Error).message);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  console.warn(`[DNS] All attempts failed for ${hostname}, using hostname as fallback`);
  return hostname;
}

const db = createDb(process.env.DATABASE_URL!);
const redisUrl = new URL(process.env.REDIS_URL!);
const redisHost = await resolveHost(redisUrl.hostname);
const redisConnection = {
  host: redisHost,
  port: parseInt(redisUrl.port || '6379', 10),
  family: 4,
  ...(redisUrl.password && { password: decodeURIComponent(redisUrl.password) }),
  ...(redisUrl.username && redisUrl.username !== 'default' && { username: redisUrl.username }),
};
const waClient = new WhatsAppClient(
  process.env.WA_GATEWAY_URL!,
  process.env.WA_GATEWAY_KEY!,
);

const app = new Hono();

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));
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
app.route('/prompts', createPromptRoutes(db));
app.route('/reports', createReportRoutes(db, redisConnection));
app.route('/migrate', createMigrateRoutes());

// Prompt chat requires ANTHROPIC_API_KEY
if (process.env.ANTHROPIC_API_KEY) {
  const { AnthropicProvider } = await import('@pharma/ai');
  const chatProvider = new AnthropicProvider(
    process.env.ANTHROPIC_API_KEY,
    'claude-sonnet-4-20250514',
  );
  app.route('/prompt-chat', createPromptChatRoutes(db, chatProvider));
}

// Seed default prompts on startup (idempotent, uses ON CONFLICT DO NOTHING)
import('@pharma/ai').then(({ seedDefaultPrompts }) => {
  seedDefaultPrompts(db).catch((err: unknown) =>
    console.warn('[SEED] Failed to seed prompts:', err),
  );
}).catch(() => { /* @pharma/ai not available, skip */ });

const port = parseInt(process.env.PORT ?? '3000', 10);

serve({ fetch: app.fetch, port }, () => {
  console.log(`[API] Pharma MSA API running on port ${port}`);
});
