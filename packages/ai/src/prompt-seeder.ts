import type { Db } from '@pharma/db';
import { agentPrompts } from '@pharma/db';
import { NAVIGATOR_SYSTEM_PROMPT } from './prompts/navigator.js';
import { buildRecoverySystemPrompt } from './prompts/recovery.js';
import { EXTRACTOR_SYSTEM_PROMPT, ENRICHED_EXTRACTOR_SYSTEM_PROMPT } from './prompts/extractor.js';
import { PRODUCT_IDENTIFIER_SYSTEM_PROMPT } from './prompts/product-identifier.js';

interface SeedPrompt {
  agentName: string;
  promptType: string;
  content: string;
  metadata: Record<string, unknown>;
}

const SEED_PROMPTS: SeedPrompt[] = [
  {
    agentName: 'navigator',
    promptType: 'system',
    content: NAVIGATOR_SYSTEM_PROMPT,
    metadata: { description: 'Navigator/Classifier system prompt', model: 'haiku', temperature: 0 },
  },
  {
    agentName: 'recovery',
    promptType: 'system',
    content: buildRecoverySystemPrompt({ name: '{persona_name}', cpf: '{persona_cpf}' }),
    metadata: { description: 'Recovery agent system prompt template', model: 'sonnet', temperature: 0.3, notes: 'Contains {persona_name} and {persona_cpf} placeholders' },
  },
  {
    agentName: 'extractor',
    promptType: 'system',
    content: EXTRACTOR_SYSTEM_PROMPT,
    metadata: { description: 'Basic extractor system prompt', model: 'sonnet', temperature: 0 },
  },
  {
    agentName: 'extractor_enriched',
    promptType: 'system',
    content: ENRICHED_EXTRACTOR_SYSTEM_PROMPT,
    metadata: { description: 'Enriched extractor with product classification', model: 'sonnet', temperature: 0 },
  },
  {
    agentName: 'product_identifier',
    promptType: 'system',
    content: PRODUCT_IDENTIFIER_SYSTEM_PROMPT,
    metadata: { description: 'Product identifier system prompt', model: 'haiku', temperature: 0 },
  },
];

export async function seedDefaultPrompts(db: Db): Promise<void> {
  for (const seed of SEED_PROMPTS) {
    try {
      await db
        .insert(agentPrompts)
        .values({
          agentName: seed.agentName,
          promptType: seed.promptType,
          content: seed.content,
          version: 1,
          isActive: true,
          metadata: seed.metadata,
        })
        .onConflictDoNothing();
    } catch (err) {
      console.warn(`[SEED] Failed to seed prompt ${seed.agentName}:${seed.promptType}:`, err);
    }
  }
  console.log(`[SEED] Seeded ${SEED_PROMPTS.length} default prompts`);
}
