import { Hono } from 'hono';
import { eq, desc } from 'drizzle-orm';
import { Queue, type ConnectionOptions } from 'bullmq';
import { type Db, campaignReports } from '@pharma/db';

export function createReportRoutes(db: Db, redis: ConnectionOptions) {
  const app = new Hono();
  const analyzeQueue = new Queue('analyze', { connection: redis });

  // Get latest report for a campaign
  app.get('/campaigns/:id/report', async (c) => {
    const campaignId = c.req.param('id');
    const [report] = await db.select().from(campaignReports)
      .where(eq(campaignReports.campaignId, campaignId))
      .orderBy(desc(campaignReports.createdAt))
      .limit(1);
    if (!report) return c.json({ error: 'No report yet' }, 404);
    return c.json(report);
  });

  // Trigger manual report generation
  app.post('/campaigns/:id/analyze', async (c) => {
    const campaignId = c.req.param('id');
    await analyzeQueue.add('analyze', { campaignId, traceId: crypto.randomUUID() });
    return c.json({ status: 'queued' });
  });

  return app;
}
