import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { scripts, type Db } from '@pharma/db';
import { FlowTreeSchema } from '@pharma/shared';

export function createScriptRoutes(db: Db) {
  const app = new Hono();

  app.get('/', async (c) => {
    const result = await db.select().from(scripts);
    return c.json(result);
  });

  app.get('/:id', async (c) => {
    const [script] = await db.select().from(scripts).where(eq(scripts.id, c.req.param('id')));
    if (!script) return c.json({ error: 'Not found' }, 404);
    return c.json(script);
  });

  app.post('/', async (c) => {
    const body = await c.req.json();

    const treeParsed = FlowTreeSchema.safeParse(body.tree);
    if (!treeParsed.success) {
      return c.json({ error: 'Invalid tree structure', details: treeParsed.error.issues }, 400);
    }

    if (!body.entryNodeId || !treeParsed.data[body.entryNodeId]) {
      return c.json({ error: `Entry node "${body.entryNodeId}" not found in tree` }, 400);
    }

    const [script] = await db.insert(scripts).values({
      name: body.name,
      description: body.description,
      tree: treeParsed.data,
      entryNodeId: body.entryNodeId,
    }).returning();

    return c.json(script, 201);
  });

  app.patch('/:id', async (c) => {
    const body = await c.req.json();

    if (body.tree) {
      const treeParsed = FlowTreeSchema.safeParse(body.tree);
      if (!treeParsed.success) {
        return c.json({ error: 'Invalid tree structure', details: treeParsed.error.issues }, 400);
      }
      body.tree = treeParsed.data;
    }

    const [updated] = await db.update(scripts).set({ ...body, updatedAt: new Date() }).where(eq(scripts.id, c.req.param('id'))).returning();
    if (!updated) return c.json({ error: 'Not found' }, 404);
    return c.json(updated);
  });

  app.delete('/:id', async (c) => {
    await db.delete(scripts).where(eq(scripts.id, c.req.param('id')));
    return c.json({ status: 'deleted' });
  });

  return app;
}
