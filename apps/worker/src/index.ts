import { Queue } from 'bullmq';
import { createDb } from '@pharma/db';
import { WhatsAppClient } from '@pharma/whatsapp';
import { createProvider } from '@pharma/ai';
import { createCampaignWorker } from './workers/campaign.worker.js';
import { createConversationWorker } from './workers/conversation.worker.js';
import { createParseWorker } from './workers/parse.worker.js';
import { createExtractWorker } from './workers/extract.worker.js';
import { createMaintenanceWorker } from './workers/maintenance.worker.js';
import type { ConnectionOptions } from 'bullmq';

const db = createDb(process.env.DATABASE_URL!);

const redisUrl = new URL(process.env.REDIS_URL!);
const redis: ConnectionOptions = {
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

const navigatorProvider = createProvider({
  provider: (process.env.NAVIGATOR_PROVIDER as 'anthropic' | 'openai') ?? 'anthropic',
  model: process.env.NAVIGATOR_MODEL ?? 'claude-haiku-4-5-20251001',
  apiKey: process.env.NAVIGATOR_PROVIDER === 'openai'
    ? process.env.OPENAI_API_KEY!
    : process.env.ANTHROPIC_API_KEY!,
});

const recoveryProvider = createProvider({
  provider: (process.env.RECOVERY_PROVIDER as 'anthropic' | 'openai') ?? 'anthropic',
  model: process.env.RECOVERY_MODEL ?? 'claude-sonnet-4-6',
  apiKey: process.env.RECOVERY_PROVIDER === 'openai'
    ? process.env.OPENAI_API_KEY!
    : process.env.ANTHROPIC_API_KEY!,
});

const extractorProvider = createProvider({
  provider: (process.env.EXTRACTOR_PROVIDER as 'anthropic' | 'openai') ?? 'anthropic',
  model: process.env.EXTRACTOR_MODEL ?? 'claude-sonnet-4-6',
  apiKey: process.env.EXTRACTOR_PROVIDER === 'openai'
    ? process.env.OPENAI_API_KEY!
    : process.env.ANTHROPIC_API_KEY!,
});

const campaignWorker = createCampaignWorker(db, redis);
const conversationWorker = createConversationWorker(db, waClient, redis);
const parseWorker = createParseWorker(db, waClient, navigatorProvider, recoveryProvider, redis);
const extractWorker = createExtractWorker(db, extractorProvider, redis);
const maintenanceWorker = createMaintenanceWorker(db, redis);

const maintenanceQueue = new Queue('maintenance', { connection: redis });

await maintenanceQueue.upsertJobScheduler(
  'check-timeouts',
  { every: 5 * 60 * 1000 },
  { name: 'check_timeouts', data: { task: 'check_timeouts' as const, traceId: 'maintenance' } },
);

await maintenanceQueue.upsertJobScheduler(
  'daily-reset',
  { pattern: '0 0 * * *' },
  { name: 'daily_reset', data: { task: 'daily_reset' as const, traceId: 'maintenance' } },
);

console.log('[WORKER] All workers started:');
console.log('  - campaign (concurrency: 2)');
console.log('  - conversation (concurrency: 5, rate: 10/min)');
console.log('  - parse (concurrency: 10)');
console.log('  - extract (concurrency: 3)');
console.log('  - maintenance (concurrency: 1)');
console.log('[WORKER] Scheduled: timeout check every 5min, daily reset at midnight');

process.on('SIGTERM', async () => {
  console.log('[WORKER] Shutting down...');
  await Promise.all([
    campaignWorker.close(),
    conversationWorker.close(),
    parseWorker.close(),
    extractWorker.close(),
    maintenanceWorker.close(),
  ]);
  process.exit(0);
});
