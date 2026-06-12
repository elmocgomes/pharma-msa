import type { Db } from '@pharma/db';
import { agentPrompts } from '@pharma/db';
import { eq, and } from 'drizzle-orm';

const cache = new Map<string, { content: string; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;

export async function loadPrompt(
  db: Db,
  agentName: string,
  promptType: string,
  fallback: string,
): Promise<string> {
  const cacheKey = `${agentName}:${promptType}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.content;

  try {
    const [row] = await db
      .select({ content: agentPrompts.content })
      .from(agentPrompts)
      .where(
        and(
          eq(agentPrompts.agentName, agentName),
          eq(agentPrompts.promptType, promptType),
          eq(agentPrompts.isActive, true),
        ),
      )
      .limit(1);

    const content = row?.content ?? fallback;
    cache.set(cacheKey, { content, expiresAt: Date.now() + CACHE_TTL_MS });
    return content;
  } catch {
    return fallback;
  }
}

export function invalidatePromptCache(agentName?: string) {
  if (agentName) {
    for (const key of cache.keys()) {
      if (key.startsWith(`${agentName}:`)) cache.delete(key);
    }
  } else {
    cache.clear();
  }
}
