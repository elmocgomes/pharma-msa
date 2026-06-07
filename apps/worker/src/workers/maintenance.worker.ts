import { Worker, type ConnectionOptions } from 'bullmq';
import { eq, lt, and } from 'drizzle-orm';
import { type Db, conversations, waSessions } from '@pharma/db';
import { transition } from '../engine/state-machine.js';
import type { MaintenanceJobData } from '../queues/definitions.js';

export function createMaintenanceWorker(db: Db, redis: ConnectionOptions) {
  return new Worker<MaintenanceJobData>(
    'maintenance',
    async (job) => {
      const { task, traceId } = job.data;

      switch (task) {
        case 'check_timeouts':
          await checkTimeouts(db, traceId);
          break;
        case 'daily_reset':
          await dailyReset(db);
          break;
      }
    },
    { connection: redis, concurrency: 1 },
  );
}

async function checkTimeouts(db: Db, traceId: string) {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

  const stale = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.status, 'waiting_response'),
        lt(conversations.updatedAt, fiveMinutesAgo),
      ),
    );

  for (const conv of stale) {
    try {
      await transition(db, {
        conversationId: conv.id,
        expectedVersion: conv.version,
        newStatus: 'timeout',
        traceId,
        eventData: { lastUpdated: conv.updatedAt.toISOString() },
      });
      console.log(`[MAINTENANCE] Timed out conversation ${conv.id}`);
    } catch {
      // optimistic lock failed — another worker handled it
    }
  }
}

async function dailyReset(db: Db) {
  await db.update(waSessions).set({
    dailyMessageCount: 0,
    lastResetAt: new Date(),
    updatedAt: new Date(),
  });
  console.log('[MAINTENANCE] Daily message counts reset');
}
