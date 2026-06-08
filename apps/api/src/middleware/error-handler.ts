import type { Context } from 'hono';

export function errorHandler(err: Error, c: Context) {
  const cause = (err as any).cause;
  const detail = cause?.message ?? cause ?? '';
  console.error(`[ERROR] ${c.req.method} ${c.req.path}:`, err.message, detail ? `| cause: ${detail}` : '');
  return c.json({ error: err.message, cause: detail || undefined }, 500);
}
