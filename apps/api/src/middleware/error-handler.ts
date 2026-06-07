import type { Context } from 'hono';

export function errorHandler(err: Error, c: Context) {
  console.error(`[ERROR] ${c.req.method} ${c.req.path}:`, err.message);
  return c.json({ error: err.message }, 500);
}
