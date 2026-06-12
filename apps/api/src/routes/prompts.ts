import { Hono } from 'hono';
import { eq, and, desc } from 'drizzle-orm';
import { type Db, agentPrompts, promptVersions } from '@pharma/db';
import { invalidatePromptCache } from '@pharma/ai';

export function createPromptRoutes(db: Db) {
  const app = new Hono();

  // List all active prompts, grouped by agent
  app.get('/', async (c) => {
    const rows = await db.select().from(agentPrompts).where(eq(agentPrompts.isActive, true));
    const grouped: Record<string, typeof rows> = {};
    for (const row of rows) {
      if (!grouped[row.agentName]) grouped[row.agentName] = [];
      grouped[row.agentName]!.push(row);
    }
    return c.json(grouped);
  });

  // Get single prompt with version history
  app.get('/:id', async (c) => {
    const id = c.req.param('id');
    const [prompt] = await db.select().from(agentPrompts).where(eq(agentPrompts.id, id));
    if (!prompt) return c.json({ error: 'Not found' }, 404);

    const versions = await db.select().from(promptVersions)
      .where(eq(promptVersions.promptId, id))
      .orderBy(desc(promptVersions.version));

    return c.json({ ...prompt, versions });
  });

  // Update a prompt (creates new version)
  app.patch('/:id', async (c) => {
    const id = c.req.param('id');
    const { content, changeReason } = await c.req.json();

    const [current] = await db.select().from(agentPrompts).where(eq(agentPrompts.id, id));
    if (!current) return c.json({ error: 'Not found' }, 404);

    const newVersion = current.version + 1;

    // Save old version
    await db.insert(promptVersions).values({
      promptId: id,
      version: current.version,
      content: current.content,
      changedBy: 'admin',
      changeReason: changeReason ?? `Updated to v${newVersion}`,
    });

    // Update current
    const [updated] = await db.update(agentPrompts).set({
      content,
      version: newVersion,
      updatedAt: new Date(),
    }).where(eq(agentPrompts.id, id)).returning();

    invalidatePromptCache(current.agentName);
    return c.json(updated);
  });

  // Revert to a previous version
  app.post('/:id/revert/:version', async (c) => {
    const id = c.req.param('id');
    const targetVersion = parseInt(c.req.param('version'));

    const [versionRow] = await db.select().from(promptVersions)
      .where(and(eq(promptVersions.promptId, id), eq(promptVersions.version, targetVersion)));

    if (!versionRow) return c.json({ error: 'Version not found' }, 404);

    const [current] = await db.select().from(agentPrompts).where(eq(agentPrompts.id, id));
    if (!current) return c.json({ error: 'Prompt not found' }, 404);

    const newVersion = current.version + 1;

    await db.insert(promptVersions).values({
      promptId: id,
      version: current.version,
      content: current.content,
      changedBy: 'admin',
      changeReason: `Reverted to v${targetVersion}`,
    });

    const [updated] = await db.update(agentPrompts).set({
      content: versionRow.content,
      version: newVersion,
      updatedAt: new Date(),
    }).where(eq(agentPrompts.id, id)).returning();

    invalidatePromptCache(current.agentName);
    return c.json(updated);
  });

  return app;
}
